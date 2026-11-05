export type AuthChallenge = {
  challengeId: string;
  purpose: "signup" | "login" | "reset" | "change_password";
  email: string;
  expiresAt: string;
  resendAt: string;
  message: string;
};
export type AuthResult = { passwordChanged: true };
