import { createContext, useContext } from "react";
import { BookOpen } from "lucide-react";

export const LibraryContext = createContext(() => {});

/** Inline IS/NBC clause reference that deep-links into the code library. */
export const ClauseChip = ({ clause, compact }) => {
  const open = useContext(LibraryContext);
  if (!clause) return null;
  return (
    <button
      type="button"
      onClick={() => open(clause.code, clause.library_id)}
      title={`${clause.code} — ${clause.clause}: ${clause.topic}`}
      data-testid={`clause-chip-${(clause.library_id || clause.code).replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
      className="inline-flex items-center gap-1 max-w-full text-[10px] font-mono text-blue-700 bg-blue-50 border border-blue-200 rounded-sm px-1 py-0.5 hover:bg-blue-100 transition-colors"
    >
      <BookOpen className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{compact ? clause.clause : `${clause.code} · ${clause.clause}`}</span>
    </button>
  );
};
