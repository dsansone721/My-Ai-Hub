import { GraduationCap, Play } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/Card";

const topics = [
  "Knowledge of Capital Markets",
  "Understanding Products and Their Risks",
  "Understanding Trading, Customer Accounts & Prohibited Activities",
  "Overview of the Regulatory Framework",
];

export default function SieTutorPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="SIE Tutor"
        description="Practice questions, concept reviews, and explanations for the Securities Industry Essentials exam."
        icon={GraduationCap}
        action={
          <button className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover">
            <Play className="h-4 w-4" /> Start practice
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-muted">
              Questions answered
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">0</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-muted">
              Accuracy
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">—</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-muted">Streak</p>
            <p className="mt-2 text-2xl font-semibold text-white">0 days</p>
          </CardBody>
        </Card>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-white">Study by topic</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {topics.map((topic) => (
            <Card key={topic}>
              <CardBody className="flex items-center justify-between">
                <span className="text-sm text-white">{topic}</span>
                <button className="text-xs font-medium text-accent hover:text-accent-hover">
                  Study →
                </button>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
