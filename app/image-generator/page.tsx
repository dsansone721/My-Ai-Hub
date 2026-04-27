import { Image as ImageIcon, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/Card";

export default function ImageGeneratorPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Image Generator"
        description="Generate on-brand visuals for decks, listings, and social posts."
        icon={ImageIcon}
      />

      <Card>
        <CardBody className="space-y-4">
          <label className="block text-sm font-medium text-white">
            Describe the image
          </label>
          <textarea
            rows={4}
            placeholder="e.g. Sunlit modern kitchen with marble island, warm wood floors, photographed at golden hour…"
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">
              Tip: include lighting, lens, and mood for best results.
            </p>
            <button className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover">
              <Sparkles className="h-4 w-4" /> Generate
            </button>
          </div>
        </CardBody>
      </Card>

      <section>
        <h2 className="text-sm font-semibold text-white">Gallery</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-lg border border-border bg-elevated/60"
              aria-label="Placeholder image"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
