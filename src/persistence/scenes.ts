import { getAllRecords, getRecord, putRecord, SCENES_STORE } from './idb'

export interface Scene {
  id: string
  title: string
  source: string
}

export async function saveScene(scene: Scene): Promise<void> {
  await putRecord(SCENES_STORE, scene)
}

export async function getScene(id: string): Promise<Scene | undefined> {
  return getRecord<Scene>(SCENES_STORE, id)
}

export async function getAllScenes(): Promise<Scene[]> {
  return getAllRecords<Scene>(SCENES_STORE)
}
