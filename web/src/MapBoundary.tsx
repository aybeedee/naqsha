import { Component, type ReactNode } from 'react'

// A map or graphics failure should not take away the readable model results.
export class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <div className="scene-error" role="alert">
          <h2>The map couldn’t start.</h2>
          <p>The storm and road summaries are still available. Reload to try the map again.</p>
          <button className="primary-button" onClick={() => window.location.reload()}>
            Reload map
          </button>
        </div>
      )
    return this.props.children
  }
}
