import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { VendorCompany, VendorApplicationStatus } from './entities/vendor-company.entity';
import { VendorCapability, CertificationType } from './entities/vendor-capability.entity';
import { VendorCapabilitySelection } from './entities/vendor-capability-selection.entity';
import { VendorCertification, CertificationReviewStatus } from './entities/vendor-certification.entity';
import { UploadsService } from '../uploads/uploads.service';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { VendorService } from './vendor.service';
import { getEnabledCounties, isEnabledCountyFips } from '../common/utils/county.utils';
import { CURRENT_VENDOR_TOS_VERSION } from '../common/constants/tos';
import {
  CURRENT_VENDOR_BACKGROUND_CHECK_VERSION, VENDOR_BACKGROUND_CHECK_TITLE, VENDOR_BACKGROUND_CHECK_TEXT,
} from '../common/constants/vendor-background-check';
import {
  buildChecklist, Checklist, ChecklistKey, EIN_PATTERN, isEditable, resolveNeedsInfo,
} from './onboarding/onboarding-checklist';

const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA',
  'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR',
  'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]);

// Everything a vendor company does before approval: fill in the checklist,
// submit it, and (after NEEDS_INFO) fix only the items a reviewer sent back.
// These are the only vendor endpoints reachable before APPROVED — see
// vendor-access.ts and ApprovedVendorGuard for the rest.
@Injectable()
export class VendorOnboardingService {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(VendorProfile) private profileRepo: Repository<VendorProfile>,
    @InjectRepository(VendorCompany) private companyRepo: Repository<VendorCompany>,
    @InjectRepository(VendorCapability) private capabilityRepo: Repository<VendorCapability>,
    @InjectRepository(VendorCapabilitySelection) private selectionRepo: Repository<VendorCapabilitySelection>,
    @InjectRepository(VendorCertification) private certificationRepo: Repository<VendorCertification>,
    private uploadsService: UploadsService,
    private notificationsService: NotificationsService,
    private vendorService: VendorService,
  ) {}

  private async load(userId: string) {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile?.companyId) throw new NotFoundException('Vendor company not found');
    const company = await this.companyRepo.findOne({ where: { id: profile.companyId } });
    if (!company) throw new NotFoundException('Vendor company not found');
    return { profile, company };
  }

  // The company admin is the applicant; technicians only exist on approved
  // companies, so they never reach onboarding.
  private async loadAsApplicant(userId: string) {
    const loaded = await this.load(userId);
    if (!loaded.profile.isCompanyAdmin) throw new ForbiddenException('Only the company admin can edit the application');
    return loaded;
  }

  private assertEditable(company: VendorCompany, key: ChecklistKey) {
    if (!isEditable(company.applicationStatus, company.needsInfoItems, key)) {
      throw new ForbiddenException(
        company.applicationStatus === VendorApplicationStatus.NEEDS_INFO
          ? 'Only the items the reviewer sent back can be changed.'
          : 'Your application can no longer be changed.',
      );
    }
  }

  private async saveEdit(company: VendorCompany, key: ChecklistKey) {
    company.needsInfoItems = resolveNeedsInfo(company.needsInfoItems, key);
    return this.companyRepo.save(company);
  }

  async getChecklist(userId: string, company: VendorCompany): Promise<Checklist> {
    const [user, selections, certifications] = await Promise.all([
      this.usersRepo.findOne({ where: { id: userId } }),
      this.selectionRepo.find({ where: { userId }, relations: ['capability'] }),
      this.certificationRepo.find({ where: { userId } }),
    ]);
    return buildChecklist({
      status: company.applicationStatus,
      company,
      hasPhoto: !!user?.avatarUrl,
      vendorTosVersion: user?.vendorTosVersion ?? null,
      selectedServices: selections.filter((s) => s.capability).map((s) => s.capability),
      certifications,
      currentTosVersion: CURRENT_VENDOR_TOS_VERSION,
      currentBackgroundCheckVersion: CURRENT_VENDOR_BACKGROUND_CHECK_VERSION,
      now: new Date(),
    });
  }

  // Status only — what the vendor portal shows a company that isn't approved
  // yet. Deliberately carries no application data.
  async getStatus(userId: string) {
    const { company, profile } = await this.load(userId);
    const checklist = await this.getChecklist(userId, company);
    return {
      applicationStatus: company.applicationStatus,
      companyName: company.name,
      submittedAt: company.submittedAt,
      reviewedAt: company.reviewedAt,
      reviewNotes: company.reviewNotes,
      isCompanyAdmin: profile.isCompanyAdmin,
      openItems: checklist.items.filter((i) => !i.complete).map((i) => ({ label: i.label, reviewerNote: i.reviewerNote })),
    };
  }

  // Full application for the app: status, checklist, and what's on file for
  // each item (so a reopened screen shows the documents already uploaded).
  async getApplication(userId: string) {
    const { company, profile } = await this.load(userId);
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    const [checklist, services, licenses, stateRegistrationUrl, coiUrl, photoUrl] = await Promise.all([
      this.getChecklist(userId, company),
      this.getMyServices(userId),
      this.getLicenses(userId),
      company.stateRegistrationDocKey ? this.uploadsService.getSignedUrl(company.stateRegistrationDocKey) : Promise.resolve(null),
      company.coiDocumentKey ? this.uploadsService.getSignedUrl(company.coiDocumentKey) : Promise.resolve(null),
      user?.avatarUrl ? this.uploadsService.getSignedUrl(user.avatarUrl) : Promise.resolve(null),
    ]);
    return {
      applicationStatus: company.applicationStatus,
      submittedAt: company.submittedAt,
      reviewedAt: company.reviewedAt,
      reviewNotes: company.reviewNotes,
      isCompanyAdmin: profile.isCompanyAdmin,
      checklist,
      company: {
        name: company.name,
        ein: company.ein,
        address: company.address,
        city: company.city,
        state: company.state,
        zipCode: company.zipCode,
      },
      photoUrl,
      services,
      licenses,
      serviceCounties: company.serviceCounties ?? [],
      documents: {
        stateRegistrationUrl,
        stateRegistrationOnFile: !!company.stateRegistrationDocKey,
        coiUrl,
        coiOnFile: !!company.coiDocumentKey,
        coiExpirationDate: company.coiExpirationDate,
      },
      backgroundCheck: {
        title: VENDOR_BACKGROUND_CHECK_TITLE,
        paragraphs: VENDOR_BACKGROUND_CHECK_TEXT,
        version: CURRENT_VENDOR_BACKGROUND_CHECK_VERSION,
        signedVersion: company.backgroundCheckVersion,
        signedAt: company.backgroundCheckAcceptedAt,
        signerName: company.backgroundCheckSignerName,
        signerTitle: company.backgroundCheckSignerTitle,
      },
    };
  }

  async updateCompany(userId: string, data: { name?: string; ein?: string; address?: string; city?: string; state?: string; zipCode?: string }) {
    const { company } = await this.loadAsApplicant(userId);
    this.assertEditable(company, 'company');
    if (data.ein !== undefined && !EIN_PATTERN.test(data.ein.trim())) throw new BadRequestException('EIN must look like 12-3456789.');
    if (data.state !== undefined && !US_STATE_CODES.has(data.state.trim().toUpperCase())) throw new BadRequestException('Choose a valid US state.');
    if (data.zipCode !== undefined && !/^\d{5}$/.test(data.zipCode.trim())) throw new BadRequestException('ZIP code must be 5 digits.');
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new BadRequestException('Company name is required.');
      company.name = data.name.trim();
    }
    if (data.ein !== undefined) company.ein = data.ein.trim();
    if (data.address !== undefined) company.address = data.address.trim();
    if (data.city !== undefined) company.city = data.city.trim();
    if (data.state !== undefined) company.state = data.state.trim().toUpperCase();
    if (data.zipCode !== undefined) company.zipCode = data.zipCode.trim();
    await this.saveEdit(company, 'company');
    await this.profileRepo.update({ companyId: company.id }, { companyName: company.name });
    return this.getApplication(userId);
  }

  async setPhoto(userId: string, avatarKey: string) {
    const { company } = await this.loadAsApplicant(userId);
    this.assertEditable(company, 'photo');
    if (!avatarKey) throw new BadRequestException('Upload a photo first.');
    await this.usersRepo.update(userId, { avatarUrl: avatarKey });
    await this.saveEdit(company, 'photo');
    return this.getApplication(userId);
  }

  async updateDocuments(userId: string, data: { stateRegistrationDocKey?: string; coiDocumentKey?: string; coiExpirationDate?: string }) {
    const { company } = await this.loadAsApplicant(userId);
    if (data.stateRegistrationDocKey !== undefined) {
      this.assertEditable(company, 'stateRegistration');
      company.stateRegistrationDocKey = data.stateRegistrationDocKey;
      company.needsInfoItems = resolveNeedsInfo(company.needsInfoItems, 'stateRegistration');
    }
    if (data.coiDocumentKey !== undefined || data.coiExpirationDate !== undefined) {
      this.assertEditable(company, 'insurance');
      if (data.coiExpirationDate !== undefined) {
        const expiry = new Date(data.coiExpirationDate);
        if (isNaN(expiry.getTime()) || expiry <= new Date()) throw new BadRequestException('The insurance expiry date must be in the future.');
        company.coiExpirationDate = expiry;
      } else if (data.coiDocumentKey !== company.coiDocumentKey) {
        throw new BadRequestException('Enter the expiry date shown on the new certificate.');
      }
      if (data.coiDocumentKey !== undefined) company.coiDocumentKey = data.coiDocumentKey;
      company.needsInfoItems = resolveNeedsInfo(company.needsInfoItems, 'insurance');
    }
    await this.companyRepo.save(company);
    return this.getApplication(userId);
  }

  // The promoted catalog — only services Attenteve is currently promoting are
  // offered at sign-up.
  async getServiceOptions(userId: string) {
    const [capabilities, selected] = await Promise.all([
      this.vendorService.getCapabilities(userId) as Promise<(VendorCapability & { acknowledged: boolean })[]>,
      this.selectionRepo.find({ where: { userId } }),
    ]);
    const selectedIds = new Set(selected.map((s) => s.capabilityId));
    return capabilities
      .filter((c) => c.isPromoted)
      .map((c) => ({
        id: c.id,
        name: c.name,
        requiredCertificationType: c.requiredCertificationType,
        isSpecialty: c.isSpecialty,
        trainingDocumentUrl: c.trainingDocumentUrl,
        requiresAcknowledgment: c.requiresAcknowledgment,
        acknowledged: c.acknowledged,
        selected: selectedIds.has(c.id),
      }));
  }

  private async getMyServices(userId: string) {
    const selections = await this.selectionRepo.find({ where: { userId }, relations: ['capability'] });
    return selections.filter((s) => s.capability).map((s) => ({
      id: s.capability.id,
      name: s.capability.name,
      requiredCertificationType: s.capability.requiredCertificationType,
    }));
  }

  async setServices(userId: string, capabilityIds: string[]) {
    const { company } = await this.loadAsApplicant(userId);
    this.assertEditable(company, 'services');
    const ids = (capabilityIds ?? []).filter((id): id is string => !!id);
    if (ids.length) {
      const offered = await this.capabilityRepo.find({ where: { id: In(ids), isActive: true, isPromoted: true } });
      if (offered.length !== new Set(ids).size) throw new BadRequestException('One or more services are not offered at sign-up.');
    }
    await this.vendorService.setMyCapabilities(userId, ids);
    await this.saveEdit(company, 'services');
    return this.getApplication(userId);
  }

  async acknowledgeService(userId: string, capabilityId: string) {
    const { company } = await this.loadAsApplicant(userId);
    this.assertEditable(company, 'services');
    return this.vendorService.acknowledgeCapability(userId, capabilityId);
  }

  private async getLicenses(userId: string) {
    const certs = await this.certificationRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    return Promise.all(certs.map(async (c) => ({
      id: c.id,
      certificationType: c.certificationType,
      licenseNumber: c.licenseNumber,
      issuingState: c.issuingState,
      expirationDate: c.expirationDate,
      status: c.status,
      reviewNotes: c.reviewNotes,
      documentUrl: c.documentKey ? await this.uploadsService.getSignedUrl(c.documentKey) : null,
    })));
  }

  private validateLicense(data: { certificationType: CertificationType; licenseNumber: string; issuingState: string; expirationDate: string; documentKey: string }) {
    if (!Object.values(CertificationType).includes(data.certificationType) || data.certificationType === CertificationType.NONE) {
      throw new BadRequestException('Choose the license type.');
    }
    if (!data.licenseNumber?.trim()) throw new BadRequestException('Enter the license number.');
    if (!US_STATE_CODES.has(data.issuingState?.trim().toUpperCase())) throw new BadRequestException('Choose the issuing state.');
    const expiry = new Date(data.expirationDate);
    if (isNaN(expiry.getTime()) || expiry <= new Date()) throw new BadRequestException('The license expiry date must be in the future.');
    if (!data.documentKey) throw new BadRequestException('Attach a photo or PDF of the license.');
  }

  async addLicense(userId: string, data: { certificationType: CertificationType; licenseNumber: string; issuingState: string; expirationDate: string; documentKey: string }) {
    const { company } = await this.loadAsApplicant(userId);
    this.assertEditable(company, 'licenses');
    this.validateLicense(data);
    await this.certificationRepo.save(this.certificationRepo.create({
      userId,
      certificationType: data.certificationType,
      licenseNumber: data.licenseNumber.trim(),
      issuingState: data.issuingState.trim().toUpperCase(),
      expirationDate: new Date(data.expirationDate),
      documentKey: data.documentKey,
      status: CertificationReviewStatus.PENDING_REVIEW,
    }));
    await this.saveEdit(company, 'licenses');
    return this.getApplication(userId);
  }

  // Only licenses that haven't been approved yet can be removed during onboarding.
  async removeLicense(userId: string, licenseId: string) {
    const { company } = await this.loadAsApplicant(userId);
    this.assertEditable(company, 'licenses');
    const cert = await this.certificationRepo.findOne({ where: { id: licenseId, userId } });
    if (!cert) throw new NotFoundException('License not found');
    if (cert.status === CertificationReviewStatus.APPROVED) throw new BadRequestException('An approved license can\'t be removed.');
    await this.certificationRepo.delete(cert.id);
    await this.saveEdit(company, 'licenses');
    return this.getApplication(userId);
  }

  getCountyOptions() {
    return getEnabledCounties();
  }

  async setCounties(userId: string, serviceCounties: string[]) {
    const { company } = await this.loadAsApplicant(userId);
    this.assertEditable(company, 'counties');
    const fips = [...new Set((serviceCounties ?? []).filter(Boolean))];
    if (fips.some((f) => !isEnabledCountyFips(f))) throw new BadRequestException('One or more counties are not open yet.');
    company.serviceCounties = fips;
    await this.saveEdit(company, 'counties');
    return this.getApplication(userId);
  }

  async signBackgroundCheck(userId: string, data: { signerName: string; signerTitle: string; agreed: boolean }) {
    const { company } = await this.loadAsApplicant(userId);
    this.assertEditable(company, 'backgroundCheck');
    if (!data.agreed) throw new BadRequestException('Confirm that you agree to the statement.');
    if (!data.signerName?.trim()) throw new BadRequestException('Type your full name to sign.');
    if (!data.signerTitle?.trim()) throw new BadRequestException('Enter your title at the company.');
    company.backgroundCheckVersion = CURRENT_VENDOR_BACKGROUND_CHECK_VERSION;
    company.backgroundCheckAcceptedAt = new Date();
    company.backgroundCheckSignerName = data.signerName.trim();
    company.backgroundCheckSignerTitle = data.signerTitle.trim();
    company.backgroundCheckAcceptedByUserId = userId;
    await this.saveEdit(company, 'backgroundCheck');
    return this.getApplication(userId);
  }

  // What a reviewer needs beyond the company row: the applicant's checklist,
  // chosen services and submitted licenses.
  async getReviewDetails(company: VendorCompany, applicantUserId: string | null) {
    if (!applicantUserId) return { checklist: null, services: [], licenses: [] };
    const [checklist, services, licenses] = await Promise.all([
      this.getChecklist(applicantUserId, company),
      this.getMyServices(applicantUserId),
      this.getLicenses(applicantUserId),
    ]);
    return { checklist, services, licenses };
  }

  async submit(userId: string) {
    const { company } = await this.loadAsApplicant(userId);
    if (company.applicationStatus !== VendorApplicationStatus.INCOMPLETE && company.applicationStatus !== VendorApplicationStatus.NEEDS_INFO) {
      throw new BadRequestException('This application has already been submitted.');
    }
    const checklist = await this.getChecklist(userId, company);
    const open = checklist.items.filter((i) => !i.complete);
    if (open.length) throw new BadRequestException(`Finish these items first: ${open.map((i) => i.label).join(', ')}.`);

    const resubmission = company.applicationStatus === VendorApplicationStatus.NEEDS_INFO;
    company.applicationStatus = VendorApplicationStatus.PENDING_REVIEW;
    company.submittedAt = new Date();
    company.needsInfoItems = null;
    await this.companyRepo.save(company);

    await this.notificationsService.notifyAdmins(
      NotificationType.VENDOR_APPLICATION_SUBMITTED,
      resubmission ? 'Vendor Application Resubmitted' : 'New Vendor Application',
      `${company.name} ${resubmission ? 'answered the review notes and resubmitted' : 'submitted'} its application for review.`,
      { vendorCompanyId: company.id },
    ).catch(() => {});

    return this.getApplication(userId);
  }
}
