"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { moveDealAction } from "./actions";

type Stage = { id: string; name: string; color: string | null };
type Deal = {
  id: string;
  stageId: string;
  title: string;
  value: number;
  currency: string;
  contactName: string;
};

// Cross-column kanban DnD (PLAN.md §5). Deliberately simplified for this
// pass: dropping onto a column appends the deal to the end of that stage —
// precise in-column reorder (drop position within a stage) is not wired
// yet, just the stage-to-stage move the exit criteria call for.
export function PipelineBoard({ stages, deals }: { stages: Stage[]; deals: Deal[] }) {
  const [columns, setColumns] = useState<Record<string, Deal[]>>(() =>
    groupByStage(stages, deals),
  );
  const [, startTransition] = useTransition();

  function handleDragEnd(event: DragEndEvent) {
    const dealId = String(event.active.id);
    const toStageId = event.over ? String(event.over.id) : null;
    if (!toStageId) return;

    const fromStageId = Object.keys(columns).find((stageId) =>
      columns[stageId].some((d) => d.id === dealId),
    );
    if (!fromStageId || fromStageId === toStageId) return;

    const deal = columns[fromStageId].find((d) => d.id === dealId);
    if (!deal) return;

    const toPosition = columns[toStageId].length;

    setColumns((prev) => ({
      ...prev,
      [fromStageId]: prev[fromStageId].filter((d) => d.id !== dealId),
      [toStageId]: [...prev[toStageId], { ...deal, stageId: toStageId }],
    }));

    startTransition(() => {
      moveDealAction({ dealId, toStageId, toPosition });
    });
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto">
        {stages.map((stage) => (
          <StageColumn key={stage.id} stage={stage} deals={columns[stage.id] ?? []} />
        ))}
      </div>
    </DndContext>
  );
}

function StageColumn({ stage, deals }: { stage: Stage; deals: Deal[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 flex-col gap-2 rounded-md border p-2 ${
        isOver ? "bg-accent" : ""
      }`}
    >
      <h3 className="px-1 text-sm font-semibold">
        {stage.name} <span className="text-muted-foreground">({deals.length})</span>
      </h3>
      {deals.map((deal) => (
        <DealCard key={deal.id} deal={deal} />
      ))}
    </div>
  );
}

function DealCard({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={
        transform
          ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
          : undefined
      }
      className={`cursor-grab rounded-md border bg-background p-2 text-sm shadow-sm ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <p className="font-medium">{deal.title}</p>
      <p className="text-muted-foreground">{deal.contactName}</p>
      <p className="text-muted-foreground">
        {deal.value} {deal.currency}
      </p>
    </div>
  );
}

function groupByStage(stages: Stage[], deals: Deal[]): Record<string, Deal[]> {
  const grouped: Record<string, Deal[]> = {};
  for (const stage of stages) grouped[stage.id] = [];
  for (const deal of deals) {
    (grouped[deal.stageId] ??= []).push(deal);
  }
  return grouped;
}
