import { createNewCareerGameState } from './db2_start_pipeline.js';
import { getClubSelectionPreview, selectCareerClub, rebuildManagerClubViews } from './db2_selection.js';

export function createNewCareer({ db1, db3, db4, db5, options = {} }) {
  return createNewCareerGameState({ db1, db3, db4, db5, options });
}

export { getClubSelectionPreview, selectCareerClub, rebuildManagerClubViews };
