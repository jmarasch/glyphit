export interface PredefinedIconPack {
  name: string;
  displayName: string;
  path: string;
  /**
   * Where the archive comes from.
   *
   * `remote` packs are downloaded from their upstream project on demand.
   * `bundled` packs ship inside the plugin folder, because they are not
   * published as a release anywhere and hosting them ourselves would break for
   * anyone whose copy of this repository is private or unpushed.
   */
  source: 'remote' | 'bundled';
  /** Download URL for `remote` packs, filename inside `iconPacks/` for `bundled`. */
  downloadLink: string;
}

const predefinedIconPacks = {
  faBrands: {
    name: 'font-awesome-brands',
    displayName: 'FontAwesome Brands',
    path: '',
    source: 'bundled',
    downloadLink: 'font-awesome-brands.zip',
  },
  faRegular: {
    name: 'font-awesome-regular',
    displayName: 'FontAwesome Regular',
    path: '',
    source: 'bundled',
    downloadLink: 'font-awesome-regular.zip',
  },
  faSolid: {
    name: 'font-awesome-solid',
    displayName: 'FontAwesome Solid',
    path: '',
    source: 'bundled',
    downloadLink: 'font-awesome-solid.zip',
  },
  remixIcons: {
    name: 'remix-icons',
    displayName: 'Remix Icons',
    path: '',
    source: 'bundled',
    downloadLink: 'remix-icons.zip',
  },
  iconBrew: {
    name: 'icon-brew',
    displayName: 'Icon Brew',
    path: '',
    source: 'bundled',
    downloadLink: 'icon-brew.zip',
  },
  /** @source https://game-icons.net/ */
  gameIcons: {
    name: 'game-icons',
    displayName: 'Game Icons',
    path: '',
    source: 'bundled',
    downloadLink: 'game-icons.net.svg.zip',
  },
  /** @source https://simpleicons.org/ */
  simpleIcons: {
    name: 'simple-icons',
    displayName: 'Simple Icons',
    path: '',
    source: 'bundled',
    downloadLink: 'simple-icons.zip',
  },
  lucide: {
    name: 'lucide-icons',
    displayName: 'Lucide',
    path: '',
    source: 'bundled',
    downloadLink: 'lucide-icons.zip',
  },
  tablerIcons: {
    name: 'tabler-icons',
    displayName: 'Tabler Icons',
    path: '',
    source: 'bundled',
    downloadLink: 'tabler-icons.zip',
  },
  /** @source https://boxicons.com/ */
  boxicons: {
    name: 'boxicons',
    displayName: 'Boxicons',
    path: 'svg',
    source: 'bundled',
    downloadLink: 'boxicons.zip',
  },
  /** @source http://nagoshiashumari.github.io/Rpg-Awesome/ */
  rpgAwesome: {
    name: 'rpg-awesome',
    displayName: 'RPG Awesome',
    path: '',
    source: 'bundled',
    downloadLink: 'rpg-awesome.zip',
  },
  /** @source https://coolicons.cool/ */
  coolicons: {
    name: 'coolicons',
    displayName: 'Coolicons',
    path: '',
    source: 'bundled',
    downloadLink: 'coolicons.zip',
  },
  /** @source https://feathericons.com/ */
  feathericons: {
    name: 'feather-icons',
    displayName: 'Feather Icons',
    path: '',
    source: 'bundled',
    downloadLink: 'feather-icons.zip',
  },
  /** @source https://github.com/primer/octicons */
  octicons: {
    name: 'octicons',
    displayName: 'Octicons',
    path: '',
    source: 'bundled',
    downloadLink: 'octicons.zip',
  },
} as { [key: string]: PredefinedIconPack };

/**
 * Returns a possible path to the icon pack.
 * @param name String of the icon pack name.
 * @returns String of the path to the icon pack or undefined if the icon pack does not
 * exist.
 */
export const getExtraPath = (iconPackName: string): string | undefined => {
  const path: string | undefined = Object.values(predefinedIconPacks).find(
    (iconPack) => iconPack.name === iconPackName,
  )?.path;
  return path?.length === 0 ? undefined : path;
};

export default predefinedIconPacks;
