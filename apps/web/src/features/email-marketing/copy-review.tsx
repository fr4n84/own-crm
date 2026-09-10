export type EmailMarketingCopyReviewVersion = Readonly<{
  id: string;
  version: number;
  subject: string;
  previewText: string | null;
  bodyText: string;
  status: "draft" | "approved" | "retired";
}>;

export function EmailMarketingCopyReview({ version }: { version: EmailMarketingCopyReviewVersion }) {
  return <article className="min-w-0 flex-1 space-y-2" data-content-version-id={version.id}>
    <div>
      <p className="text-xs font-medium text-muted-foreground">Versión y asunto</p>
      <p className="break-words text-sm font-medium">v{version.version} · {version.subject}</p>
    </div>
    {version.previewText ? <div>
      <p className="text-xs font-medium text-muted-foreground">Previsualización exacta</p>
      <p className="break-words text-sm">{version.previewText}</p>
    </div> : null}
    <div>
      <p className="text-xs font-medium text-muted-foreground">Contenido exacto</p>
      <p className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 text-sm">{version.bodyText}</p>
    </div>
    <p className="text-xs text-muted-foreground">{version.status === "approved" ? "Aprobada" : version.status === "retired" ? "Sustituida" : "Pendiente de aprobación"}</p>
  </article>;
}