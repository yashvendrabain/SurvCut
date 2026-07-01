export default function GeneratePage() {
  return (
    <div className="pt-16">
      <h1 className="text-4xl font-black tracking-tight mb-4">
        Generate
      </h1>
      <p className="text-ink-400 mb-8">
        Wizard step scaffold — Week 2 fills this in.
      </p>
      <div className="glass rounded-2xl p-8">
        <p className="text-sm text-ink-500">
          This page will host the <strong className="text-white"></strong> step of the wizard.
          The API endpoint is wired at <code className="text-bain-400">/api/generate</code> and returns typed
          Pydantic models from the FastAPI backend.
        </p>
      </div>
    </div>
  );
}