import config from './package.json';
import { renderInto } from './src/LsxFull';

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

function wrapCode(OriginalCode: any) {
  return function LsxFullCodeWrapper(props: any) {
    console.log('[lsxfull] wrapCode called, className:', props.className, 'children type:', typeof props.children, 'children:', String(props.children).substring(0, 100));
    if (props.className === 'language-lsxfull') {
      const uid = `lsxfull-${Math.random().toString(36).substring(2, 10)}`;
      console.log('[lsxfull] matched lsxfull code block, uid:', uid, 'code:', props.children);

      // Try multiple strategies to find and populate the element
      const tryPopulate = (attempt: number) => {
        const el = document.getElementById(uid);
        console.log(`[lsxfull] populate attempt #${attempt}, found:`, !!el, 'uid:', uid);
        if (el) {
          console.log('[lsxfull] element found, el.tagName:', el.tagName, 'el.innerHTML:', el.innerHTML.substring(0, 50));
          renderInto(el, props.children as string);
        } else if (attempt < 20) {
          setTimeout(() => tryPopulate(attempt + 1), 200);
        } else {
          console.error('[lsxfull] gave up finding element after 20 attempts');
          // Fallback: try querySelector
          const fallback = document.querySelector('[data-lsxfull-uid="' + uid + '"]');
          console.log('[lsxfull] fallback querySelector:', !!fallback);
        }
      };
      setTimeout(() => tryPopulate(1), 0);

      // Strategy A: pass id to OriginalCode
      const resultA = OriginalCode({
        ...props,
        className: '',
        children: 'Loading...',
        id: uid,
      });
      console.log('[lsxfull] OriginalCode returned:', typeof resultA, resultA);
      return resultA;
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
