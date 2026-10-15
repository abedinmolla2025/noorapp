/**
 * ReviewerNote — optional scholar-reviewer attribution block.
 *
 * Today no reviewer data exists, so it renders the honest existing label:
 *   "Source-verified research · Not reviewed by a scholar"
 *
 * When a review happens, pass reviewer + date and it renders instead:
 *   "Reviewed by <reviewer> · <date>"
 *
 * Props are optional on purpose: <ReviewerNote /> with no props keeps the
 * current truthful label. Future wiring: feed `reviewer`/`date` from a
 * config or CMS when a scholar review is completed.
 */
interface ReviewerNoteProps {
  reviewer?: string;
  date?: string;
  className?: string;
}

const ReviewerNote = ({ reviewer, date, className }: ReviewerNoteProps) => {
  const text =
    reviewer && reviewer.trim()
      ? `Reviewed by ${reviewer.trim()}${date && date.trim() ? ` · ${date.trim()}` : ""}`
      : "Source-verified research · Not reviewed by a scholar";

  return (
    <p className={className ?? "mt-1 text-[10px] italic text-white/35"}>
      {text}
    </p>
  );
};

export default ReviewerNote;
