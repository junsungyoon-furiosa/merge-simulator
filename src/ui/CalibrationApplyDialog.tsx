import { useEffect, useRef } from "react";
import type { CalibrationPreviewItem } from "../calibration/applyCalibration";

interface Props {
  items: CalibrationPreviewItem[];
  onCancel: () => void;
  onConfirm: () => void;
}

export function CalibrationApplyDialog({ items, onCancel, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    returnFocus.current = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    return () => returnFocus.current?.focus();
  }, []);

  return (
    <dialog ref={dialogRef} className="calibration-dialog" aria-labelledby="calibration-dialog-title" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <form method="dialog" onSubmit={(event) => { event.preventDefault(); onConfirm(); }}>
        <span className="eyebrow">APPLY PROFILE</span>
        <h2 id="calibration-dialog-title">관측·추정값을 적용할까요?</h2>
        <p>아래 환경 파라미터만 바뀝니다. 정책 설정과 실험 규모는 유지됩니다.</p>
        <div className="calibration-preview">
          {items.map((item) => (
            <div key={item.id} className="calibration-preview-row">
              <strong>{item.label}</strong>
              <span>{item.currentText}</span>
              <b aria-hidden="true">→</b>
              <span>{item.nextText}</span>
              {!item.changed && <small>값 유지 · 출처만 연결</small>}
            </div>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>취소</button>
          <button type="submit" className="primary-action">적용</button>
        </div>
      </form>
    </dialog>
  );
}
