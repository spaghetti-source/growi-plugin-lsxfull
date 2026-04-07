import config from './package.json';
import { plugin } from './src/plugin';

declare const growiFacade: {
  markdownRenderer?: {
    optionsGenerators: {
      customGenerateViewOptions: ((...args: unknown[]) => any) | null;
      generateViewOptions: (...args: unknown[]) => any;
      customGeneratePreviewOptions: ((...args: unknown[]) => any) | null;
      generatePreviewOptions: (...args: unknown[]) => any;
    };
  };
};

const activate = (): void => {
  console.log('[lsxfull] activate called');
  if (growiFacade == null || growiFacade.markdownRenderer == null) {
    console.log('[lsxfull] growiFacade not available');
    return;
  }

  const { optionsGenerators } = growiFacade.markdownRenderer;
  console.log('[lsxfull] registering remark plugin');

  // Register for view rendering
  const originalViewOptions = optionsGenerators.customGenerateViewOptions;
  optionsGenerators.customGenerateViewOptions = (...args: unknown[]) => {
    const options = originalViewOptions
      ? originalViewOptions(...args)
      : optionsGenerators.generateViewOptions(...args);
    options.remarkPlugins.push(plugin as any);
    return options;
  };

  // Register for preview rendering
  const originalPreviewOptions = optionsGenerators.customGeneratePreviewOptions;
  optionsGenerators.customGeneratePreviewOptions = (...args: unknown[]) => {
    const options = originalPreviewOptions
      ? originalPreviewOptions(...args)
      : optionsGenerators.generatePreviewOptions(...args);
    options.remarkPlugins.push(plugin as any);
    return options;
  };
};

const deactivate = (): void => {};

if ((window as any).pluginActivators == null) {
  (window as any).pluginActivators = {};
}
(window as any).pluginActivators[config.name] = { activate, deactivate };
