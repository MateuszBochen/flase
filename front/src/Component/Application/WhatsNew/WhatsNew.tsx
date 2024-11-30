import React, {FC} from 'react';
import './style.css';

/**
 * This is a default application
 * @author Mateusz Bochen
 */
const WhatsNew: FC<undefined> = () => {
  return(
    <div>
      <h1>
        JavaScript Application MySQL Utilities
      </h1>

      <h2>
        Features and Todo:
      </h2>
      <ol>
        <li className="feature done">
          Selecting query history
        </li>
        <li className="feature done">
          Pagination
        </li>
        <li className="feature done">
          Scroll click open new tab
        </li>
        <li className="feature done">
          Table sticky header not not jumping
        </li>
        <li className="bug done">
          Bug: with refresh page with load database tables - all database have same tables
        </li>
        <li className="feature done">
          Update data in double click
        </li>
        <li className="feature">
          Resizable query input
        </li>
        <li className="bug">
          Bug: show proces list not working - loading forever
        </li>
        <li className="feature">
          Creating new record
        </li>
        <li className="feature">
          Creating new database
        </li>
        <li className="feature">
          Dropping database
        </li>
        <li className="feature">
          CSV export
        </li>
        <li className="feature">
          Load records one by one
        </li>
        <li className="feature">
          Support for many connections - db servers
        </li>
        <li className="feature">
          Support PostgreSQL
        </li>
        <li className="feature">
          Users accounts management
        </li>
      </ol>
    </div>
  );
}

export default WhatsNew;
