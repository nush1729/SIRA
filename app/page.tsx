/**
 * PLACEHOLDER landing — owned by Role D (docs/10 §1). Kept to a redirect so the
 * root URL lands somewhere sensible while only the staff UI exists.
 */
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/login");
}
