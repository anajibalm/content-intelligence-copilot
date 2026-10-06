import ProcessingForm from "./processing-form";
import WorkspaceClient from "./workspace-client";

export const dynamic = "force-dynamic";

export default function Home() {
  return <><WorkspaceClient /><div className="workspace workspace-ingest"><ProcessingForm /></div></>;
}
