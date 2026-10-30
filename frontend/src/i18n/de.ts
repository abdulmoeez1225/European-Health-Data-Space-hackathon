import type { Messages } from "./en";
import { applicant } from "./messages/applicant";
import { common } from "./messages/common";
import { decisions } from "./messages/decisions";
import { privacy } from "./messages/privacy";
import { spe } from "./messages/spe";
import { staff } from "./messages/staff";

/** German, typed against the English keys: a missing key does not compile. */
export const de: Messages = {
  ...common.de,
  ...decisions.de,
  applicant: applicant.de,
  staff: staff.de,
  spe: spe.de,
  privacy: privacy.de,
};
