import { redirect } from "next/navigation";

export default function TotemTabletPage() {
  redirect("/totem?mode=tablet");
}