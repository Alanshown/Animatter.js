# @animatter/react

Optional React lifecycle hooks for the shared Animatter runtime. Peer dependencies: React >=18 and animatter ^0.1.0. Version 0.1.0 is packed locally from the monorepo; no npm publication is claimed.

useAnimatter returns {ref,world}; useSurface registers a ref and cleans up on unmount. Keep surface option objects stable. World options are captured on mount; configure the world for live changes.

[Usage and tests](https://github.com/Alanshown/Animatter.js/blob/main/README.md#react-and-vue). MIT.
