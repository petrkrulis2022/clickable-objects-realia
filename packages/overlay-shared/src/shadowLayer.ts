// The one root-element-per-page pattern every overlay in this repo
// uses: inject into document.body behind an open shadow root, fixed
// to the viewport at max z-index, so the host page's CSS can never
// reach in and nothing of ours can leak out. Never queries, reads or
// attaches to the host page's own DOM.

export const Z_INDEX_MAX = 2147483647;

export interface ShadowLayer {
  host: HTMLDivElement;
  root: ShadowRoot;
  layerEl: HTMLDivElement;
  destroy(): void;
}

export function mountShadowLayer(hostId: string, layerClassName = "overlay-layer"): ShadowLayer {
  const host = document.createElement("div");
  host.id = hostId;
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .${layerClassName} {
      position: fixed;
      inset: 0;
      z-index: ${Z_INDEX_MAX};
      pointer-events: none;
    }
  `;
  root.appendChild(style);

  const layerEl = document.createElement("div");
  layerEl.className = layerClassName;
  root.appendChild(layerEl);

  document.body.appendChild(host);

  return {
    host,
    root,
    layerEl,
    destroy: () => host.remove(),
  };
}
