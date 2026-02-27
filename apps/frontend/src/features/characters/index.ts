/**
 * Barrel export for character detail feature (PRD-112).
 */

/* Pages */
export { CharacterDetailPage } from "./CharacterDetailPage";

/* Hooks */
export {
  characterDetailKeys,
  useCharacterSettings,
  useUpdateCharacterSettings,
  useCharacterMetadata,
  useUpdateCharacterMetadata,
} from "./hooks/use-character-detail";

/* Types */
export type { CharacterSettings, CharacterMetadata } from "./types";
