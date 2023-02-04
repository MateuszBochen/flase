import React, {Component} from "react";
import './style.css';

class WhatsNew extends Component {
    render() {
        return(
            <div>
                <h1>
                    It's works! new data base manager
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
                        Table sticky header not not jumping
                    </li>
                    <li className="bug">
                        Bug: with refresh page with load database tables - all database have same tables
                    </li>
                    <li className="feature">
                        Update data in double click
                    </li>
                    <li className="feature">
                        Resizable query input
                    </li>
                    <li className="bug">
                        Bug: show proces list not working - loading forever
                    </li>
                </ol>
            </div>
        );
    }
}

export default WhatsNew;
