// ─── USER CONFIGURATION ───────────────────────────────────────────────────────
// Edit this file to customize search behaviour without touching sync.js

export const CONFIG = {
  credentialsFile : "./credentials.json",
  tokenFile       : "./token.json",
  storeFile       : "./applications.json",
  outputDocx      : "./Job_Application_Tracker.docx",

  // Scan emails from this date onward (YYYY-MM-DD)
  searchAfterDate : "2020-01-01",

  scopes          : ["https://www.googleapis.com/auth/gmail.readonly"],
};

// Keywords that identify automated employer confirmation emails
export const APPLY_KEYWORDS = [
  '"thank you for applying"',
  '"thank you for your application"',
  '"thank you for your interest"',
  '"thank you for taking the time to apply"',
  '"we have received your application"',
  '"application has been received"',
  '"successfully submitted your"',
];

// Keywords that signal a status change in a thread
export const STATUS_SIGNALS = {
  rejected   : ["not moving forward", "have not selected", "we did not select",
                 "position has been filled", "filled this position", "recently filled",
                 "decided to pursue other", "regret to inform",
                 "we will not be moving forward", "will not be moving forward",
                 "no longer recruiting", "position is no longer available",
                 "chosen not to move forward", "not been selected",
                 "unable to move forward", "timing didn't align",
                 "timing did not align", "decided to move forward with other",
                 "pursue other candidates"],
  interview  : ["invite you to interview", "interview invitation", "schedule an interview",
                 "would like to interview", "pleased to invite you", "interview on"],
  assessment : ["technical assessment", "coding challenge", "coderpad", "hackerrank",
                 "online assessment", "invite you to complete", "competency assessment"],
  offer      : ["pleased to offer", "offer of employment", "job offer"],
  screening  : ["screening call", "quick call", "introductory call", "recruiter call"],
};
