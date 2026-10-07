import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faLock, faSpinner} from '@fortawesome/free-solid-svg-icons';

interface PendingChangesBarPropsInterface {
  canEdit: boolean;
  readOnlyReason?: string;
  pendingCount: number;
  submitting: boolean;
  onRevert: () => void;
  onPreview: () => void;
  onSubmit: () => void;
}

/** PendingChangesBar - state of editing in table footer, actions themselves are in context menu */
export default (props: PendingChangesBarPropsInterface) => {
  if (!props.canEdit) {
    return props.readOnlyReason ? (
      <span className="pending-bar read-only" title={props.readOnlyReason}>
        <FontAwesomeIcon icon={faLock} /> Read only
      </span>
    ) : null;
  }

  if (!props.pendingCount) {
    return null;
  }

  return (
    <span className="pending-bar">
      <span className="pending-count">{props.pendingCount} pending</span>
      <button type="button" className="pending-action" onClick={props.onRevert} disabled={props.submitting}>Revert</button>
      <button type="button" className="pending-action" onClick={props.onPreview} disabled={props.submitting}>Preview SQL</button>
      <button type="button" className="pending-action submit" onClick={props.onSubmit} disabled={props.submitting}>
        {props.submitting ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Submit'}
      </button>
    </span>
  );
}
