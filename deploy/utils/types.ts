export type Collection = {
  metadataUrl?: string | null;
  tokens: { metadataUrl?: string; tokenId?: number }[];
  collectionId?: string;
  tokenId?: number;
};

export type Fungible = {
  metadataUrl?: string;
  decimals: number;
  tokenId?: string;
};

export type GameData = {
  appAgent: { metadataUrl?: string } | null;
  fungibles: Fungible[];
  nftCollections: Collection[];
};
