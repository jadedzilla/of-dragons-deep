import { useEffect, useRef, useState } from "react";
import { useApp } from "../context.js";
import { parseImport, planImport } from "../lib/importFormat.js";
import { Dialog } from "./Dialog.jsx";

const NOT_EXPORT = <>This isn't an export from the Of Dragons Deep plugin. In game, type <code>/dragonsdeep</code>, click <b>Copy JSON</b> and paste it here.</>;
export const OLD_EXPORT = "This is from an older version of the Of Dragons Deep plugin. Update the plugin in game, then copy it again.";
const ERRORS = {
  empty: <>Paste the plugin's <b>Copy JSON</b> export first.</>,
  notExport: NOT_EXPORT,
  badJson: "This JSON couldn't be read. It may have been cut off when it was copied.",
  old: OLD_EXPORT,
};
const sample = (arr, n = 12) => arr.slice(0, n).join(", ") + (arr.length > n ? `, … (+${arr.length - n} more)` : "");
const s = (n, one, many) => (n === 1 ? one : many);

/**
 * The shared Import dialog (fish and achievements from the plugin's export). preset: { text, result } from an import
 * link. onImported(plan, summary) applies a successful import.
 */
export function ImportDialog({ open, preset, onClose, onImported }) {
  const { fishById, caught, marks, progress } = useApp();
  const [text, setText] = useState("");
  const [mode, setMode] = useState("replace");
  const [result, setResult] = useState(null); // { content, warn }
  const [confirming, setConfirming] = useState(false); // Replace needs a second click when it would unmark anything
  const textRef = useRef(null);

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) { // each time it opens: Replace, no message (unless a link filled it in)
    setWasOpen(open);
    if (open) {
      setMode("replace");
      setConfirming(false);
      if (preset) setText(preset.text);
      setResult(preset?.result ?? null);
    }
  }

  const reset = () => setConfirming(false);
  function submit(e) {
    e.preventDefault();
    const parsed = parseImport(text);
    if (parsed.error) return setResult({ content: ERRORS[parsed.error], warn: true });
    const replace = mode === "replace";
    const plan = planImport(parsed, { fishIds: new Set(fishById.keys()), caught, marks, progress, replace });
    if (plan.empty) {
      return setResult({ warn: true, content: <>This export has no caught fish or achievements in it, so nothing was changed.
        {plan.unknown.length > 0 && <div className="sub">{`Not fish: ${sample(plan.unknown)}`}</div>}</> });
    }
    if (plan.needsConfirm && !confirming) {
      const { removed, unmarkAch } = plan;
      const what = [removed.length ? `${removed.length} fish` : "", unmarkAch.length ? `${unmarkAch.length} ${s(unmarkAch.length, "achievement", "achievements")}` : ""].filter(Boolean);
      setConfirming(what.join(" + "));
      return setResult({ warn: true, content: <>This will <b>{`unmark ${what.join(" and ")}`}</b>{` that ${removed.length + unmarkAch.length > 1 ? "aren't" : "isn't"} in your export. Click the button again to confirm.`}</> });
    }
    setText("");
    setConfirming(false);
    onImported(plan);
  }

  return (
    <Dialog open={open} onClose={onClose} focusRef={textRef} className="import-dialog" id="importDialog">
      <form method="dialog" id="importForm" onSubmit={submit}>
        <h2>Import</h2>
        <p className="hint">Imports your <b>caught fish</b> and <b>fishing achievements</b> (with in-game progress) from the
          Of Dragons Deep plugin. In game, type <code>/dragonsdeep</code>, click <b>Copy JSON</b> and paste it here.
          {" "}<b>Copy tracker link</b> opens this with everything filled in.</p>
        <textarea id="importText" ref={textRef} rows="6" spellCheck="false" value={text}
          placeholder='{"source":"OfDragonsDeep","version":2,"fish":[…],"achievements":[…]}'
          onChange={e => { setText(e.target.value); reset(); }} />
        <div className="modes">
          <label><input type="radio" name="importMode" value="replace" checked={mode === "replace"} onChange={() => { setMode("replace"); reset(); }} /> Replace my fish and achievements with this export</label>
          <label><input type="radio" name="importMode" value="add" checked={mode === "add"} onChange={() => { setMode("add"); reset(); }} /> Add to my fish and achievements</label>
        </div>
        <div className={`import-result${result?.warn ? " warn" : ""}`} id="importResult" role="status">{result?.content}</div>
        <div className="actions">
          <button type="button" className="btn" id="importCancel" onClick={onClose}>Close</button>
          <button type="submit" className={`btn primary${confirming ? " danger" : ""}`} id="importGo" value="import">
            {confirming ? `Unmark ${confirming} & import` : "Import"}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** The notice shown after a successful import. counts: { fish: [have, total], spear: [have, total] }. */
export function importSummary(plan, counts) {
  const { known, fresh, unknown, invalid, removed, unmarkAch, hasAchievements, achDone, achNew, achProgress } = plan;
  const already = known.length - fresh.length;
  return <>
    Marked <b>{fresh.length}</b>{` new fish as caught${already ? ` (${already} already caught)` : ""}.`}
    {hasAchievements && <> <b>{achDone}</b>{` ${s(achDone, "achievement", "achievements")} complete${achNew ? ` (${achNew} new)` : ""}`}
      {achProgress > 0 && <>, progress for <b>{achProgress}</b> more</>} (see <a href="#achievements">Achievements</a>).</>}
    {unmarkAch.length > 0 && <> Unmarked <b>{unmarkAch.length}</b>{` ${s(unmarkAch.length, "achievement", "achievements")} the game says ${s(unmarkAch.length, "isn't", "aren't")} complete.`}</>}
    {removed.length > 0 && <> Unmarked <b>{removed.length}</b> fish not in the export.</>}
    {counts.spear[1]
      ? <> You now have <b>{counts.fish[0]}</b>{` / ${counts.fish[1]} fish and `}<b>{counts.spear[0]}</b>{` / ${counts.spear[1]} spearfish caught.`}</>
      : <> You now have <b>{counts.fish[0]}</b>{` / ${counts.fish[1]} caught.`}</>}
    {unknown.length > 0 && <> <div className="sub">{`Skipped ${unknown.length} ID${unknown.length > 1 ? "s that aren't fish" : " that isn't a fish"}: ${sample(unknown)}`}</div></>}
    {invalid.length > 0 && <> <div className="sub">{`Skipped ${invalid.length} entr${invalid.length > 1 ? "ies that aren't item IDs" : "y that isn't an item ID"}: ${sample(invalid)}`}</div></>}
  </>;
}

/** The import summary notice at the bottom of the screen. */
export function Toast({ notice, onDismiss }) {
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(onDismiss, notice.ms);
    return () => clearTimeout(t);
  }, [notice, onDismiss]);
  const [last, setLast] = useState(notice);
  if (notice && notice !== last) setLast(notice);
  return (
    <div className={`toast import-result${last ? " ok" : ""}${notice ? " show" : ""}`} id="toast" role="status" aria-live="polite">
      {last && <>{last.content}<button type="button" className="toast-x" aria-label="Dismiss" onClick={onDismiss}>×</button></>}
    </div>
  );
}
