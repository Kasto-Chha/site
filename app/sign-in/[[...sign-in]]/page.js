import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="auth-page">
      <SignIn path="/sign-in" signUpUrl="/sign-up" />
    </div>
  );
}
