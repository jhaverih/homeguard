import { DocumentUpload } from './DocumentUpload';
import { LICENSE_LABEL } from './OnboardingUI';

// Upload card for one trade license (see DocumentUpload for how it works).
// `submit` is passed in so the same card works for a new license during the
// application and for a renewal on the credentials screen.

type Props = {
  type: string;                                   // trade, e.g. 'HVAC'
  title?: string;
  submit: (documentKey: string) => Promise<void>; // tells the server about the uploaded file
};

export function LicenseUpload({ type, title, submit }: Props) {
  const label = LICENSE_LABEL[type] ?? type;
  return (
    <DocumentUpload
      title={title ?? `Upload your ${label} license`}
      hint="A PDF (up to 10 MB) or a clear photo. We read the license number, state, names and dates for you."
      what="license"
      buttonLabel="Upload License"
      folder="vendor-licenses"
      submit={submit}
    />
  );
}
