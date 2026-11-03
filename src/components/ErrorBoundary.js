import { Component } from 'react';
import es from '../content/es';
import { captureClientException } from '../lib/clientMonitoring';

export class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    captureClientException(error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return <p className="p-8 text-center text-ink-soft">{es.errors.generic}</p>;
    }
    return this.props.children;
  }
}
