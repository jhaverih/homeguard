import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { getVendorAccess } from './vendor-access';
import { daysUntil, isExpired, REMINDER_DAYS } from './credentials/credential-expiry';
import { User } from '../users/entities/user.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { VendorCompany, VendorApplicationStatus } from './entities/vendor-company.entity';
import { VendorCapability, CertificationType } from './entities/vendor-capability.entity';
import { VendorCapabilitySelection } from './entities/vendor-capability-selection.entity';
import { VendorCertification, CertificationReviewStatus } from './entities/vendor-certification.entity';
import { VendorStateRegistration } from './entities/vendor-state-registration.entity';
import { UploadsService } from '../uploads/uploads.service';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { VendorService } from './vendor.service';
import { LicenseReadingService } from './licenses/license-reading.service';
import { getEnabledCounties, isEnabledCountyFips, statesForCounties } from '../common/utils/county.utils';
import { ENABLED_SERVICE_STATES } from '../common/config/enabled-service-states';
import { CURRENT_VENDOR_TOS_VERSION } from '../common/constants/tos';
import {
  CURRENT_VENDOR_BACKGROUND_CHECK_VERSION, VENDOR_BACKGROUND_CHECK_TITLE, VENDOR_BACKGROUND_CHECK_TEXT,
} from '../common/constants/vendor-background-check';
import {
  buildChecklist, Checklist, ChecklistKey, isEditable, registrationCounts, resolveNeedsInfo,
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
    @InjectRepository(VendorStateRegistration) private registrationRepo: Repository<VendorStateRegistration>,
    private uploadsService: UploadsService,
    private notificationsService: NotificationsService,
    private vendorService: VendorService,
    private dataSource: DataSource,
    private licenseReading: LicenseReadingService,
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
    const [user, selections, certifications, stateRegistrations] = await Promise.all([
      this.usersRepo.findOne({ where: { id: userId } }),
      this.selectionRepo.find({ where: { userId }, relations: ['capability'] }),
      this.certificationRepo.find({ where: { userId } }),
      this.registrationRepo.find({ where: { companyId: company.id } }),
    ]);
    return buildChecklist({
      status: company.applicationStatus,
      company,
      hasPhoto: !!user?.avatarUrl,
      vendorTosVersion: user?.vendorTosVersion ?? null,
      selectedServices: selections.filter((s) => s.capability).map((s) => s.capability),
      certifications,
      stateRegistrations,
      currentTosVersion: CURRENT_VENDOR_TOS_VERSION,
      currentBackgroundCheckVersion: CURRENT_VENDOR_BACKGROUND_CHECK_VERSION,
      now: new Date(),
    });
  }

  // Status only — what the vendor portal shows a company that isn't approved
  // yet. Deliberately carries no application data.
  async getStatus(userId: string) {
    const { company, profile } = await this.load(userId);
    const [checklist, access] = await Promise.all([this.getChecklist(userId, company), getVendorAccess(this.dataSource, userId)]);
    return {
      applicationStatus: company.applicationStatus,
      // Approved, but insurance or the caller's own license has expired: the
      // app and portal show only the credential renewal screen.
      credentialsLocked: access.credentialsExpired,
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
    const [checklist, services, licenses, states, coiUrl, photoUrl] = await Promise.all([
      this.getChecklist(userId, company),
      this.getMyServices(userId),
      this.getLicenses(userId),
      this.getStates(company),
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
        address: company.address,
        city: company.city,
        state: company.state,
        zipCode: company.zipCode,
      },
      photoUrl,
      services,
      licenses,
      serviceCounties: company.serviceCounties ?? [],
      // One entry per state the company serves or has registered in.
      states,
      documents: {
        // Old app builds read these two; the registration for the company's
        // own state stands in for the single registration they expect.
        stateRegistrationUrl: states.find((s) => s.registration?.documentUrl)?.registration?.documentUrl ?? null,
        stateRegistrationOnFile: states.some((s) => s.registration?.documentUrl),
        coiUrl,
        coiOnFile: !!company.coiDocumentKey,
        coiExpirationDate: company.coiExpirationDate,
        ...this.coiSummary(company),
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

  // EIN is no longer collected; older app builds may still send it, and it's ignored.
  async updateCompany(userId: string, data: { name?: string; ein?: string; address?: string; city?: string; state?: string; zipCode?: string }) {
    const { company } = await this.loadAsApplicant(userId);
    this.assertEditable(company, 'company');
    if (data.state !== undefined && !US_STATE_CODES.has(data.state.trim().toUpperCase())) throw new BadRequestException('Choose a valid US state.');
    if (data.zipCode !== undefined && !/^\d{5}$/.test(data.zipCode.trim())) throw new BadRequestException('ZIP code must be 5 digits.');
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new BadRequestException('Company name is required.');
      company.name = data.name.trim();
    }
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

  // Used by older app builds (one registration, typed insurance expiry). New
  // builds call uploadStateRegistration / uploadInsurance below. Either way
  // the document is read by the AI laptop.
  async updateDocuments(userId: string, data: { stateRegistrationDocKey?: string; coiDocumentKey?: string; coiExpirationDate?: string }) {
    const { company } = await this.loadAsApplicant(userId);
    if (data.stateRegistrationDocKey) {
      const state = company.state || statesForCounties(company.serviceCounties)[0];
      if (!state) throw new BadRequestException('Add your business address first.');
      await this.uploadStateRegistration(userId, { state, documentKey: data.stateRegistrationDocKey });
    }
    if (data.coiDocumentKey !== undefined || data.coiExpirationDate !== undefined) {
      this.assertEditable(company, 'insurance');
      if (data.coiExpirationDate !== undefined) {
        const expiry = new Date(data.coiExpirationDate);
        if (isNaN(expiry.getTime()) || expiry <= new Date()) throw new BadRequestException('The insurance expiry date must be in the future.');
        company.coiExpirationDate = expiry;
        company.coiReminderSentDays = null;
      }
      const newDocument = !!data.coiDocumentKey && data.coiDocumentKey !== company.coiDocumentKey;
      if (data.coiDocumentKey !== undefined) company.coiDocumentKey = data.coiDocumentKey;
      company.needsInfoItems = resolveNeedsInfo(company.needsInfoItems, 'insurance');
      if (newDocument) await this.licenseReading.startCoi(company);
      else await this.companyRepo.save(company);
    }
    return this.getApplication(userId);
  }

  // ── State business registrations (one per state) ──────────────────────────

  // Every state the company serves (from its counties) or has a registration
  // for, with whether it can take jobs there:
  //   canOperate  the registration is approved (or a temporary pass is running)
  //               and Attenteve is open in that state
  //   required    the company has chosen counties in this state
  async getStates(company: VendorCompany) {
    const now = new Date();
    const regs = await this.registrationRepo.find({ where: { companyId: company.id } });
    const served = statesForCounties(company.serviceCounties);
    const all = [...new Set([...served, ...regs.map((r) => r.state)])].sort();
    return Promise.all(all.map(async (state) => {
      const r = regs.find((x) => x.state === state) ?? null;
      const approved = !!r && r.status === CertificationReviewStatus.APPROVED && registrationCounts(r, now);
      return {
        state,
        required: served.includes(state),
        open: ENABLED_SERVICE_STATES.includes(state),
        canOperate: approved && ENABLED_SERVICE_STATES.includes(state),
        registration: r ? {
          id: r.id,
          status: r.status,
          graceUntil: r.graceUntil,
          businessName: r.businessName,
          entityNumber: r.entityNumber,
          registeredState: r.registeredState,
          registrationStatus: r.registrationStatus,
          formationDate: r.formationDate,
          extractionConfidence: r.extractionConfidence,
          reviewReasons: r.reviewReasons ?? [],
          reviewNotes: r.reviewNotes,
          updatedAt: r.updatedAt,
          documentUrl: r.documentKey ? await this.uploadsService.getSignedUrl(r.documentKey) : null,
        } : null,
      };
    }));
  }

  async getMyStates(userId: string) {
    const { company } = await this.load(userId);
    return this.getStates(company);
  }

  // Upload (or replace) the registration for one state; it's read in the
  // background. Allowed while filling in the application (or when a reviewer
  // sent it back), and any time after approval, to add a state or replace a
  // registration. Not while the application is waiting for review.
  async uploadStateRegistration(userId: string, data: { state: string; documentKey: string }) {
    const { company } = await this.loadAsApplicant(userId);
    if (company.applicationStatus !== VendorApplicationStatus.APPROVED) this.assertEditable(company, 'stateRegistration');
    const state = data.state?.trim().toUpperCase();
    if (!US_STATE_CODES.has(state)) throw new BadRequestException('Choose the state this registration is for.');
    if (!data.documentKey?.startsWith('vendor-applications/')) throw new BadRequestException('Attach a PDF or photo of the registration.');

    const existing = await this.registrationRepo.findOne({ where: { companyId: company.id, state } });
    if (existing?.status === CertificationReviewStatus.READING) {
      throw new BadRequestException(`Your ${state} registration is still being read. Try again in a few minutes.`);
    }
    const reg = existing ?? this.registrationRepo.create({ companyId: company.id, state });
    reg.documentKey = data.documentKey;
    reg.businessName = null;
    reg.entityNumber = null;
    reg.registeredState = null;
    reg.registrationStatus = null;
    reg.formationDate = null;
    reg.extraction = null;
    reg.extractionConfidence = null;
    await this.licenseReading.startRegistration(reg);
    if (company.applicationStatus !== VendorApplicationStatus.APPROVED) await this.saveEdit(company, 'stateRegistration');
    return this.getApplication(userId);
  }

  // ── Certificate of insurance ──────────────────────────────────────────────

  private coiSummary(company: VendorCompany) {
    const x = (company.coiExtraction ?? {}) as Record<string, any>;
    return {
      coiStatus: company.coiStatus,
      coiReviewReasons: company.coiReviewReasons ?? [],
      coiReviewNotes: company.coiReviewNotes,
      coiInsuredName: x.insuredName ?? null,
      coiInsurerName: x.insurerName ?? null,
      coiPolicyNumber: x.policyNumber ?? null,
      coiGeneralLiability: x.generalLiabilityPerOccurrence ?? null,
      coiAdditionalInsured: x.additionalInsured ?? null,
      coiAdditionalInsuredName: x.additionalInsuredName ?? null,
    };
  }

  // Upload the certificate of insurance; the AI laptop reads the dates,
  // limit and additional insured in the background. Works during the
  // application and, for an approved company, as a renewal.
  async uploadInsurance(userId: string, data: { documentKey: string }) {
    const { company } = await this.loadAsApplicant(userId);
    const approved = company.applicationStatus === VendorApplicationStatus.APPROVED;
    if (!approved) this.assertEditable(company, 'insurance');
    if (!data.documentKey?.startsWith('vendor-applications/')) throw new BadRequestException('Attach a PDF or photo of the certificate.');
    if (company.coiStatus === CertificationReviewStatus.READING) {
      throw new BadRequestException('Your certificate is still being read. Try again in a few minutes.');
    }
    company.coiDocumentKey = data.documentKey;
    company.coiExtraction = null;
    if (!approved) company.needsInfoItems = resolveNeedsInfo(company.needsInfoItems, 'insurance');
    await this.licenseReading.startCoi(company);
    if (approved) {
      await this.notificationsService.notifyAdmins(
        NotificationType.VENDOR_CREDENTIAL_RENEWED,
        'Vendor Insurance Uploaded',
        `${company.name} uploaded a new certificate of insurance; it is being read automatically.`,
        { vendorCompanyId: company.id },
      ).catch(() => {});
    }
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
      // What the license reader found (null until it has read the document).
      issueDate: c.issueDate,
      holderName: c.holderName,
      businessName: c.businessName,
      extractedLicenseType: c.extractedLicenseType,
      extractionConfidence: c.extractionConfidence,
      reviewReasons: c.reviewReasons ?? [],
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

  // Upload-and-read flow: the vendor picks the trade and uploads the file; the
  // license reader on the AI laptop fills in the number, state, names and
  // dates in the background (licenses/license-reading.service.ts). The app
  // re-fetches the application to see the result.
  async uploadLicense(userId: string, data: { certificationType: CertificationType; documentKey: string }) {
    const { company } = await this.loadAsApplicant(userId);
    this.assertEditable(company, 'licenses');
    this.assertLicenseUpload(data);
    await this.licenseReading.start(this.certificationRepo.create({
      userId,
      certificationType: data.certificationType,
      documentKey: data.documentKey,
      licenseNumber: null,
      expirationDate: null,
    }));
    await this.saveEdit(company, 'licenses');
    return this.getApplication(userId);
  }

  private assertLicenseUpload(data: { certificationType: CertificationType; documentKey: string }) {
    if (!Object.values(CertificationType).includes(data.certificationType) || data.certificationType === CertificationType.NONE) {
      throw new BadRequestException('Choose the license type.');
    }
    if (!data.documentKey?.startsWith('vendor-licenses/')) throw new BadRequestException('Attach a photo or PDF of the license.');
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

  // ── Credential renewal (approved companies) ───────────────────────────────
  // Reachable while locked out for an expired credential (vendor-access.ts):
  // this is how the vendor gets access back. Renewing early, from an expiry
  // reminder, works the same way.

  async getCredentials(userId: string) {
    const { company, profile } = await this.load(userId);
    const access = await getVendorAccess(this.dataSource, userId);
    const now = new Date();
    const certs = await this.certificationRepo.find({ where: { userId }, order: { expirationDate: 'DESC' } });
    const expiredIds = new Set(access.expiredLicenseIds);
    const credential = (expiry: Date | null) => ({
      expirationDate: expiry,
      daysLeft: expiry ? daysUntil(expiry, now) : null,
      expired: isExpired(expiry, now),
      expiringSoon: !!expiry && !isExpired(expiry, now) && daysUntil(expiry, now) <= REMINDER_DAYS[0],
    });
    return {
      locked: access.credentialsExpired,
      isCompanyAdmin: profile.isCompanyAdmin,
      insurance: {
        ...credential(company.coiExpirationDate),
        ...this.coiSummary(company),
        documentUrl: company.coiDocumentKey ? await this.uploadsService.getSignedUrl(company.coiDocumentKey) : null,
        // Company-level: only the company admin can replace it.
        canRenew: profile.isCompanyAdmin,
      },
      licenses: await Promise.all(certs
        .filter((c) => c.status !== CertificationReviewStatus.REJECTED)
        .map(async (c) => ({
          id: c.id,
          certificationType: c.certificationType,
          licenseNumber: c.licenseNumber,
          issuingState: c.issuingState,
          status: c.status,
          reviewReasons: c.reviewReasons ?? [],
          reviewNotes: c.reviewNotes,
          ...credential(c.expirationDate),
          // Superseded by a newer license of the same type → not blocking.
          blocking: expiredIds.has(c.id),
          documentUrl: c.documentKey ? await this.uploadsService.getSignedUrl(c.documentKey) : null,
        }))),
    };
  }

  private parseFutureDate(value: string, what: string) {
    const date = new Date(value);
    if (!value || isNaN(date.getTime()) || date <= new Date()) throw new BadRequestException(`The ${what} expiry date must be in the future.`);
    return date;
  }

  async renewInsurance(userId: string, data: { coiDocumentKey: string; coiExpirationDate: string }) {
    const { company } = await this.loadAsApplicant(userId);
    if (company.applicationStatus !== VendorApplicationStatus.APPROVED) {
      throw new BadRequestException('Update your insurance from your application.');
    }
    if (!data.coiDocumentKey) throw new BadRequestException('Attach the renewed certificate of insurance.');
    company.coiExpirationDate = this.parseFutureDate(data.coiExpirationDate, 'insurance');
    company.coiDocumentKey = data.coiDocumentKey;
    company.coiReminderSentDays = null;
    await this.companyRepo.save(company);
    await this.notificationsService.notifyAdmins(
      NotificationType.VENDOR_CREDENTIAL_RENEWED,
      'Vendor Insurance Renewed',
      `${company.name} uploaded a renewed certificate of insurance (expires ${company.coiExpirationDate.toLocaleDateString()}).`,
      { vendorCompanyId: company.id },
    );
    return this.getCredentials(userId);
  }

  // The renewed license goes back to PENDING_REVIEW: the vendor gets the app
  // back right away, but jobs needing that trade license only match again
  // once an admin approves it (service-requests: APPROVED, unexpired certs).
  async renewLicense(userId: string, licenseId: string, data: { licenseNumber?: string; expirationDate: string; documentKey: string }) {
    const { company } = await this.load(userId);
    const cert = await this.certificationRepo.findOne({ where: { id: licenseId, userId } });
    if (!cert) throw new NotFoundException('License not found');
    if (!data.documentKey) throw new BadRequestException('Attach a photo or PDF of the renewed license.');
    cert.expirationDate = this.parseFutureDate(data.expirationDate, 'license');
    if (data.licenseNumber?.trim()) cert.licenseNumber = data.licenseNumber.trim();
    cert.documentKey = data.documentKey;
    cert.status = CertificationReviewStatus.PENDING_REVIEW;
    cert.reviewNotes = null as any;
    cert.reviewedAt = null;
    cert.reminderSentDays = null;
    await this.certificationRepo.save(cert);
    await this.notificationsService.notifyAdmins(
      NotificationType.VENDOR_CREDENTIAL_RENEWED,
      'Vendor License Renewed',
      `${company.name} uploaded a renewed ${cert.certificationType} license for review.`,
      { vendorCompanyId: company.id, certificationId: cert.id },
    );
    return this.getCredentials(userId);
  }

  // Renewal through the reader: the renewed license is saved as a new record
  // of the same trade and read in the background. Once it's verified, it
  // replaces the expired one (credential-expiry.ts treats a type as expired
  // only when no newer license of that type is current).
  async renewLicenseUpload(userId: string, licenseId: string, data: { documentKey: string }) {
    const old = await this.certificationRepo.findOne({ where: { id: licenseId, userId } });
    if (!old) throw new NotFoundException('License not found');
    this.assertLicenseUpload({ certificationType: old.certificationType, documentKey: data.documentKey });
    await this.licenseReading.start(this.certificationRepo.create({
      userId,
      certificationType: old.certificationType,
      documentKey: data.documentKey,
      issuingState: old.issuingState,
      licenseNumber: null,
      expirationDate: null,
    }));
    return this.getCredentials(userId);
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
    const states = await this.getStates(company);
    const insurance = this.coiSummary(company);
    if (!applicantUserId) return { checklist: null, services: [], licenses: [], states, insurance };
    const [checklist, services, licenses] = await Promise.all([
      this.getChecklist(applicantUserId, company),
      this.getMyServices(applicantUserId),
      this.getLicenses(applicantUserId),
    ]);
    return { checklist, services, licenses, states, insurance };
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
