import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faLock, faSpinner} from '@fortawesome/free-solid-svg-icons';

interface PendingChangesBarPropsInterface {
  canEdit: boolean;
  readOnlyReason?: string;
  pendingCount: number;
  submitting: boolean;
  /** some rows are deleted - foreign key checks can be turned off */
  hasDeletes: boolean;
  ignoreForeignKeys: boolean;
  onIgnoreForeignKeys: (ignore: boolean) => void;
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
      {props.hasDeletes && (
        <label
          className="pending-option"
          title={'Deleted rows can be referenced by other tables. MySQL: FOREIGN_KEY_CHECKS = 0. '
            + 'PostgreSQL: session_replication_role = replica - needs superuser, also other triggers are skipped.'}
        >
          <input
            type="checkbox"
            checked={props.ignoreForeignKeys}
            disabled={props.submitting}
            onChange={(event) => props.onIgnoreForeignKeys(event.target.checked)}
          />
          No foreign key checks
        </label>
      )}
      <button type="button" className="pending-action" onClick={props.onRevert} disabled={props.submitting}>Revert</button>
      <button type="button" className="pending-action" onClick={props.onPreview} disabled={props.submitting}>Preview SQL</button>
      <button type="button" className="pending-action submit" onClick={props.onSubmit} disabled={props.submitting}>
        {props.submitting ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Submit'}
      </button>
    </span>
  );
}
