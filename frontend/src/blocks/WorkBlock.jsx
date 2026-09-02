// Shared implementation behind every "Work" Tool -- a real, distinct
// Tool per kind of thinking-act (judge, inquire, and whatever gets
// added later), not a generic Text block with a label. Every kind
// shares one underlying shape ({statement, support, confidence}) so
// Synthesis can treat them uniformly, but each kind still gets its own
// registry entry, name, and catalog demo (see AssessmentBlock.jsx /
// QuestionBlock.jsx, thin wrappers that just name the two text fields
// for their own kind and pass everything else through here) -- the
// same "shared skeleton, distinct surface" reasoning already used for
// how a List's shape is inferred rather than duplicated per Tool.
//
// `support` was originally a single `rationale` prose blob; it's now a
// list of discrete points, for "surgical" precision -- each point is
// either its own short free-text claim, or a link to an existing claim
// elsewhere (another Work block's statement, or a Skeleton lane item),
// resolved live rather than copied -- the same pattern Tensions'
// statementA/statementB pointers already established in ListWorkshop.
// A block created before this redesign may still be on the old
// {rationale} shape; normalizeWorkContent in backend/src/db/queries.js
// upgrades it on the way out, same approach normalizeTextContent
// already takes for Text blocks, so this component only ever sees the
// current shape.
//
// Confidence reuses the exact CONFIDENCE_LEVELS scale every List item
// already uses, rather than inventing a separate scale for Work.

import { useEffect, useState } from 'react';
import { getBlocksForSpace, updateBlockContent, getWorkItems, getSkeletonClaims, getBlock } from '../api.js';
import { CONFIDENCE_LEVELS } from '../registry/blocks.js';

// Mirrors backend/src/db/queries.js's WORK_TYPES -- the frontend and
// backend are separate bundles, so this can't be a shared import, only
// a matching literal (same reasoning as SKELETON_LANE_LABELS in
// registry/skeleton.js mirroring the backend's SKELETON_LANES). Used
// only to find candidate Work blocks in the same Space a support point
// could link to.
const WORK_TYPES = [
  'assessment',
  'question',
  'analysis',
  'deduction',
  'definition',
  'demonstration',
  'insight',
  'implication',
  'hypothesis',
  'objection',
];

// A Tension pairs claims from these three Skeleton lanes; the same set
// makes sense as link candidates here. Mirrors CLAIM_LANE_KEYS in
// ListWorkshop.jsx and backend/src/routes/skeleton.js.
const CLAIM_LANE_KEYS = ['premises', 'evidence', 'open-questions'];

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// Resolves a support point's {spaceId, blockId, itemId} pointer live,
// so editing the source claim updates every place that links to it
// automatically. itemId is null when the pointer targets a whole Work
// block (its own statement is the claim); set when it targets a
// specific Skeleton lane item, same as a Tension's own pointers.
// spaceId is only present when the link crosses Spaces -- a same-Space
// pointer omits it entirely (including every pointer saved before
// cross-Space linking existed), so it resolves against spaceBlocks the
// same way it always has. A cross-Space pointer resolves against
// crossSpaceBlocks instead, a small per-block cache WorkBlock fetches
// on demand via GET /blocks/:id (see the effect below) -- fetching the
// one target block directly rather than every block in a Space this
// component isn't even viewing.
//
// Returns `undefined` while the data needed to resolve it hasn't
// arrived yet (distinct from `null`, which means the claim genuinely no
// longer exists), so SupportItem can show "Resolving..." instead of
// flashing "(linked claim removed)" during the brief window before a
// fetch completes.
function resolvePointer(pointer, ownSpaceId, spaceBlocks, crossSpaceBlocks) {
  if (!pointer) return null;
  if (pointer.spaceId && pointer.spaceId !== ownSpaceId) {
    const block = crossSpaceBlocks[pointer.blockId];
    if (block === undefined) return undefined;
    if (!block) return null;
    if (pointer.itemId) {
      const item = block.content?.items?.find((i) => i.id === pointer.itemId);
      return item ? { text: item.text, spaceTitle: block.spaceTitle } : null;
    }
    return block.content?.statement ? { text: block.content.statement, spaceTitle: block.spaceTitle } : null;
  }
  if (!spaceBlocks) return undefined;
  const block = spaceBlocks.find((b) => b.id === pointer.blockId);
  if (!block) return null;
  if (pointer.itemId) {
    const item = block.content?.items?.find((i) => i.id === pointer.itemId);
    return item ? { text: item.text } : null;
  }
  return block.content?.statement ? { text: block.content.statement } : null;
}

function EditableField({ editable, value, placeholder, multiline = false, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  async function finish() {
    setEditing(false);
    if (draft === value) return;
    await onSave(draft);
  }

  if (editing) {
    const Field = multiline ? 'textarea' : 'input';
    return (
      <Field
        {...(multiline ? { rows: 3 } : { type: 'text' })}
        value={draft}
        autoFocus
        className="field-full field-inherit-font"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => !multiline && event.key === 'Enter' && finish()}
      />
    );
  }
  return (
    <span
      className={editable ? 'editable' : undefined}
      onClick={() => {
        if (!editable) return;
        setDraft(value);
        setEditing(true);
      }}
    >
      {value || placeholder}
    </span>
  );
}

// The "+ Link a claim" picker: candidates are every other Work block's
// statement, plus every item in a claim-bearing Skeleton lane -- from
// this Space AND every other one, since a support point can point at a
// claim anywhere (Open item 6's own resolution: the same "compile
// several claims" reach Synthesis's picker already has). A single
// pick, unlike Tensions' pair-picker, since a support point links to
// just one claim. Cross-Space candidates are fetched lazily, only once
// this picker actually opens -- getWorkItems/getSkeletonClaims are
// cross-Space listings that would be wasted work on every WorkBlock
// render otherwise. Grouped by Space (this Space's own candidates are
// built first, so they group first) and searchable, the same pattern
// CreateSynthesis.jsx's own cross-Space picker already established,
// since the candidate list can now be large.
function SupportLinker({ ownSpaceId, spaceBlocks, excludeBlockId, onLink, onCancel }) {
  const [search, setSearch] = useState('');
  const [crossSpaceWorkItems, setCrossSpaceWorkItems] = useState(null);
  const [crossSpaceClaims, setCrossSpaceClaims] = useState(null);

  useEffect(() => {
    getWorkItems().then(setCrossSpaceWorkItems).catch(() => setCrossSpaceWorkItems([]));
    getSkeletonClaims().then(setCrossSpaceClaims).catch(() => setCrossSpaceClaims([]));
  }, []);

  const sameSpaceCandidates = [
    ...(spaceBlocks || [])
      .filter((b) => WORK_TYPES.includes(b.type) && b.id !== excludeBlockId && b.content.statement)
      .map((b) => ({
        spaceId: ownSpaceId,
        blockId: b.id,
        itemId: null,
        text: b.content.statement,
        source: capitalize(b.type),
      })),
    ...(spaceBlocks || [])
      .filter((b) => CLAIM_LANE_KEYS.includes(b.properties?.skeletonLane))
      .flatMap((b) =>
        (b.content.items || []).map((item) => ({
          spaceId: ownSpaceId,
          blockId: b.id,
          itemId: item.id,
          text: item.text,
          source: b.content.laneLabel,
        }))
      ),
  ];
  const crossSpaceWorkCandidates = (crossSpaceWorkItems || [])
    .filter((item) => item.space_id !== ownSpaceId && item.id !== excludeBlockId && item.content.statement)
    .map((item) => ({
      spaceId: item.space_id,
      spaceTitle: item.space_title,
      blockId: item.id,
      itemId: null,
      text: item.content.statement,
      source: capitalize(item.type),
    }));
  const crossSpaceClaimCandidates = (crossSpaceClaims || [])
    .filter((claim) => claim.spaceId !== ownSpaceId)
    .map((claim) => ({
      spaceId: claim.spaceId,
      spaceTitle: claim.spaceTitle,
      blockId: claim.blockId,
      itemId: claim.itemId,
      text: claim.text,
      source: claim.laneLabel,
    }));

  const allCandidates = [...sameSpaceCandidates, ...crossSpaceWorkCandidates, ...crossSpaceClaimCandidates];
  const filtered = allCandidates.filter((c) => c.text.toLowerCase().includes(search.trim().toLowerCase()));

  const bySpace = new Map();
  filtered.forEach((candidate) => {
    const label = candidate.spaceId === ownSpaceId ? 'This Space' : candidate.spaceTitle || 'Another Space';
    const bucket = bySpace.get(label) || [];
    bucket.push(candidate);
    bySpace.set(label, bucket);
  });

  const stillLoadingCrossSpace = crossSpaceWorkItems === null || crossSpaceClaims === null;

  return (
    <div className="work-block-linker">
      {allCandidates.length === 0 && !stillLoadingCrossSpace && (
        <p className="list-workshop-empty">
          Nothing to link to yet -- a claim is another Work item&rsquo;s own statement (an Assessment, a
          Hypothesis, ...) or an item filed into a Skeleton section (Premises, Evidence, Open Questions), in
          this Space or any other. Add one of those first, then come back here.
        </p>
      )}
      {allCandidates.length > 0 && (
        <input
          type="text"
          value={search}
          placeholder="Search by text..."
          className="space-search-input"
          onChange={(event) => setSearch(event.target.value)}
        />
      )}
      {[...bySpace.entries()].map(([spaceLabel, candidates]) => (
        <div key={spaceLabel}>
          <h4 className="work-block-linker-space">{spaceLabel}</h4>
          <ul className="checkbox-list">
            {candidates.map((candidate) => (
              <li key={`${candidate.spaceId}-${candidate.blockId}-${candidate.itemId || ''}`}>
                <button
                  type="button"
                  className="btn-ghost-small"
                  onClick={() =>
                    onLink(
                      candidate.spaceId === ownSpaceId
                        ? { blockId: candidate.blockId, itemId: candidate.itemId }
                        : { spaceId: candidate.spaceId, blockId: candidate.blockId, itemId: candidate.itemId }
                    )
                  }
                >
                  {candidate.text}
                </button>{' '}
                <span className="tension-builder-lane">({candidate.source})</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {stillLoadingCrossSpace && <p className="mono-caption">(loading claims from other Spaces...)</p>}
      <button type="button" className="btn-ghost-small" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function SupportItem({ item, ownSpaceId, spaceBlocks, crossSpaceBlocks, editable, onSaveText, onRemove }) {
  if (item.pointer) {
    const resolved = resolvePointer(item.pointer, ownSpaceId, spaceBlocks, crossSpaceBlocks);
    return (
      <li className="work-block-support-item work-block-support-pointer">
        <span
          className="work-block-support-link-icon"
          title={item.pointer.spaceId ? 'Linked to a claim in another Space' : 'Linked to another claim'}
        >
          ↦
        </span>
        {resolved === undefined && <em>Resolving...</em>}
        {resolved === null && <em>(linked claim removed)</em>}
        {resolved && (
          <>
            {resolved.text}
            {resolved.spaceTitle && <span className="tension-builder-lane"> (in {resolved.spaceTitle})</span>}
          </>
        )}
        {editable && (
          <button type="button" className="work-block-support-remove" onClick={onRemove} title="Remove">
            ✕
          </button>
        )}
      </li>
    );
  }
  return (
    <li className="work-block-support-item">
      <EditableField editable={editable} value={item.text || ''} placeholder="(empty)" onSave={onSaveText} />
      {editable && (
        <button type="button" className="work-block-support-remove" onClick={onRemove} title="Remove">
          ✕
        </button>
      )}
    </li>
  );
}

// onSave lets a parent override where an edit goes -- the Tools
// catalog's own interactive demo (see ToolsPage.jsx's DemoBlock), same
// pattern every other simple Block already follows (see
// ReferenceBlock.jsx).
function WorkBlock({ block, onSave, onBlocksChanged, statementLabel, supportLabel }) {
  const editable = Boolean(block.id) || Boolean(onSave);
  const [content, setContent] = useState(block.content);
  const [spaceBlocks, setSpaceBlocks] = useState(null);
  const [crossSpaceBlocks, setCrossSpaceBlocks] = useState({});
  const [newSupportText, setNewSupportText] = useState('');
  const [linking, setLinking] = useState(false);

  // Needed both to resolve any existing pointer support points and to
  // offer link candidates -- fetched once per block instance, same
  // eagerness ListWorkshop already applies for Tensions. Gated on
  // block.id specifically, not editable -- a demo block is "editable"
  // via onSave but has no real space_id to fetch against.
  useEffect(() => {
    if (block.id) getBlocksForSpace(block.space_id).then(setSpaceBlocks);
  }, [block.id, block.space_id]);

  // Resolving a cross-Space support pointer needs that one specific
  // block, not this Space's own list -- fetched on demand (GET
  // /blocks/:id) as pointers referencing it show up, and cached here so
  // the same target isn't re-fetched every render. Re-checks whenever
  // support changes, but only ever fetches ids missing from the cache.
  useEffect(() => {
    const support = content.support || [];
    const neededIds = [
      ...new Set(
        support
          .filter((item) => item.pointer?.spaceId && item.pointer.spaceId !== block.space_id)
          .map((item) => item.pointer.blockId)
          .filter((id) => !(id in crossSpaceBlocks))
      ),
    ];
    if (neededIds.length === 0) return;
    Promise.all(neededIds.map((id) => getBlock(id).catch(() => null))).then((fetched) => {
      setCrossSpaceBlocks((prev) => {
        const next = { ...prev };
        neededIds.forEach((id, index) => {
          next[id] = fetched[index];
        });
        return next;
      });
    });
  }, [content.support, block.space_id, crossSpaceBlocks]);

  async function save(next) {
    setContent(next);
    if (!editable) return;
    if (onSave) {
      await onSave(next);
    } else {
      await updateBlockContent(block.id, next);
      onBlocksChanged?.();
    }
  }

  function cycleConfidence() {
    if (!editable) return;
    const nextIndex = (CONFIDENCE_LEVELS.indexOf(content.confidence) + 1) % CONFIDENCE_LEVELS.length;
    save({ ...content, confidence: CONFIDENCE_LEVELS[nextIndex] });
  }

  const support = content.support || [];

  function addFreeTextSupport(event) {
    event.preventDefault();
    if (!newSupportText.trim()) return;
    save({ ...content, support: [...support, { id: crypto.randomUUID(), text: newSupportText.trim() }] });
    setNewSupportText('');
  }

  function addLinkedSupport(pointer) {
    setLinking(false);
    save({ ...content, support: [...support, { id: crypto.randomUUID(), pointer }] });
  }

  function saveSupportText(itemId, text) {
    save({ ...content, support: support.map((item) => (item.id === itemId ? { ...item, text } : item)) });
  }

  function removeSupportItem(itemId) {
    save({ ...content, support: support.filter((item) => item.id !== itemId) });
  }

  return (
    <div className="work-block">
      <p className="work-block-statement">
        <EditableField
          editable={editable}
          value={content.statement || ''}
          placeholder={`(add the ${statementLabel.toLowerCase()})`}
          onSave={(next) => save({ ...content, statement: next })}
        />
      </p>

      <div className="work-block-support">
        <span className="work-block-field-label">{supportLabel}:</span>
        {support.length === 0 && <p className="list-workshop-empty">(nothing added yet)</p>}
        {support.length > 0 && (
          <ul className="work-block-support-list">
            {support.map((item) => (
              <SupportItem
                key={item.id}
                item={item}
                ownSpaceId={block.space_id}
                spaceBlocks={spaceBlocks}
                crossSpaceBlocks={crossSpaceBlocks}
                editable={editable}
                onSaveText={(text) => saveSupportText(item.id, text)}
                onRemove={() => removeSupportItem(item.id)}
              />
            ))}
          </ul>
        )}
        {editable && !linking && (
          <form onSubmit={addFreeTextSupport} className="add-item-row">
            <input
              type="text"
              value={newSupportText}
              placeholder="+ Add a point"
              onChange={(event) => setNewSupportText(event.target.value)}
            />
            <button type="submit" className="btn-ghost-small" disabled={!newSupportText.trim()}>
              Add
            </button>
            <button
              type="button"
              className="btn-ghost-small"
              onClick={() => setLinking(true)}
              title="Point at another claim -- a Work item's own statement, or an item filed into a Skeleton section, in this Space or any other -- instead of retyping it here. Editing the original later updates this link automatically."
            >
              🔗 Link a claim
            </button>
          </form>
        )}
        {editable && linking && (
          <SupportLinker
            ownSpaceId={block.space_id}
            spaceBlocks={spaceBlocks}
            excludeBlockId={block.id}
            onLink={addLinkedSupport}
            onCancel={() => setLinking(false)}
          />
        )}
      </div>

      <p className="work-block-confidence">
        Confidence:{' '}
        <span
          className={editable ? 'editable-toggle' : undefined}
          onClick={cycleConfidence}
          title={editable ? 'Click to cycle: questioned -> tentative -> moderate -> solid -> certain' : undefined}
        >
          {content.confidence || 'tentative'}
        </span>
      </p>
    </div>
  );
}

export default WorkBlock;
