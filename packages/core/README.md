# animatter

An optional, framework-agnostic physics-driven interaction runtime. Version 0.1.0 is built and packed from the Animatter.js monorepo; no npm registry publication is claimed.

```ts
import {createWorld} from 'animatter';
const world=createWorld({mode:'field'});
world.scan('[data-am]');
// On client teardown:
world.destroy();
```

[Full English README](https://github.com/Alanshown/Animatter.js/blob/main/README.md) · [简体中文](https://github.com/Alanshown/Animatter.js/blob/main/README.zh-CN.md) · [API](https://github.com/Alanshown/Animatter.js/blob/main/docs/API.md)

MIT. See the repository for tested browser scope and algorithmic limits.
