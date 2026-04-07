import config from './package.json';
import { LsxFull } from './src/LsxFull';

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

function wrapCode(OriginalCode: React.FunctionComponent<any>) {
  return function LsxFullCodeWrapper(props: any) {
    if (props.className === 'language-lsxfull') {
      return LsxFull({ code: props.children as string });
    }
    return OriginalCode(props);
  };
}

const activate = (): void => {
  if (growiFacade == null || growiFacade.markdownRenderer == null) return;

  const { optionsGenerators } = growiFacade.markdownRenderer;

  const originalViewOptions = optionsGenerators.customGenerateViewOptions;
  optionsGenerators.customGenerateViewOptions = (...args: unknown[]) => {
    const options = originalViewOptions
      ? originalViewOptions(...args)
      : optionsGenerators.generateViewOptions(...args);
    options.components.code = wrapCode(options.components.code);
    return options;
  };

  const originalPreviewOptions = optionsGenerators.customGeneratePreviewOptions;
  optionsGenerators.customGeneratePreviewOptions = (...args: unknown[]) => {
    const options = originalPreviewOptions
      ? originalPreviewOptions(...args)
      : optionsGenerators.generatePreviewOptions(...args);
    options.components.code = wrapCode(options.components.code);
    return options;
  };
};

const deactivate = (): void => {};

if ((window as any).pluginActivators == null) {
  (window as any).pluginActivators = {};
}
(window as any).pluginActivators[config.name] = { activate, deactivate };
