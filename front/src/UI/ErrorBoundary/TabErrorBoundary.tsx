import React from 'react';
import './style.css';

interface TabErrorBoundaryPropsInterface {
  /** name of tab in message */
  tabName: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Error of one tab is shown in the tab - other tabs and sidebar keep working (without it the whole page is white).
 * @author Mateusz Bochen
 */
class TabErrorBoundary extends React.Component<TabErrorBoundaryPropsInterface, {error: Error | null}> {
  state = {error: null as Error | null};

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`Tab ${this.props.tabName} failed`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <div className="tab-error-boundary" role="alert">
        <h3>This tab stopped working</h3>
        <p>{this.state.error.message || String(this.state.error)}</p>
        <div className="tab-error-boundary-buttons">
          <button type="button" className="button main-button" onClick={() => this.setState({error: null})}>Try again</button>
          <button type="button" className="button main-button" onClick={this.props.onClose}>Close tab</button>
        </div>
      </div>
    );
  }
}

export default TabErrorBoundary;
