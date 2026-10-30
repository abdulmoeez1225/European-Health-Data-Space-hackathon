import { applicant } from "./messages/applicant";
import { common } from "./messages/common";
import { decisions } from "./messages/decisions";
import { privacy } from "./messages/privacy";
import { spe } from "./messages/spe";
import { staff } from "./messages/staff";

/** English: the source of every message key. */
export const en = {
  ...common.en,
  ...decisions.en,
  applicant: applicant.en,
  staff: staff.en,
  spe: spe.en,
  privacy: privacy.en,
};

export type Messages = typeof en;
