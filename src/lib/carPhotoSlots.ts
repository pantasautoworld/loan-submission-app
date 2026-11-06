export interface CarPhotoGuide {
  label: string;
  hint: string;
  /** A missing plate is only suspicious on shots where one is normally in frame. */
  expectsPlate: boolean;
}

/** The photo guide, in PDF page order. A photo's position in the list decides which one it is. */
export const CAR_PHOTO_GUIDE: CarPhotoGuide[] = [
  { label: "Cover photo", hint: "Front 3/4 view", expectsPlate: true },
  { label: "Back 45°", hint: "Rear 3/4 view", expectsPlate: true },
  { label: "Front View", hint: "Straight on, from the front", expectsPlate: true },
  { label: "Back View", hint: "Straight on, from the rear", expectsPlate: true },
  { label: "Side View", hint: "Full side of the car", expectsPlate: false },
  { label: "Interior front", hint: "Front seats", expectsPlate: false },
  { label: "Interior back", hint: "Rear seats", expectsPlate: false },
  { label: "Dashboard", hint: "Dashboard and steering wheel", expectsPlate: false },
];

export const EXTRA_PHOTO_LABEL = "Extra";
export const MAX_CAR_PHOTOS = 30;
export const CAR_PHOTO_FIELD_PREFIX = "photo_";

export function carPhotoGuideAt(index: number): CarPhotoGuide {
  return (
    CAR_PHOTO_GUIDE[index] ?? { label: EXTRA_PHOTO_LABEL, hint: "Additional photo", expectsPlate: false }
  );
}
