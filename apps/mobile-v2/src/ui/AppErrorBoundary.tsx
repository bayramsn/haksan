import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Button } from './index';
import { captureException } from '@/src/observability/sentry';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    captureException(error, { boundary: 'app-root' });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View
        accessibilityLiveRegion="assertive"
        className="flex-1 items-center justify-center gap-4 bg-canvas px-8"
      >
        <Text accessibilityRole="header" className="text-center font-display text-[28px] text-foreground">
          Uygulama bu ekranı açamadı
        </Text>
        <Text selectable className="text-center font-inter text-sm leading-5 text-muted-foreground">
          Verileriniz değiştirilmedi. Ekranı yeniden kurmak için tekrar deneyin.
        </Text>
        <Button label="Tekrar dene" onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}
