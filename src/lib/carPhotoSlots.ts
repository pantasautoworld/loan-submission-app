export interface CarPhotoSlot {
  key: string;
  label: string;
  hint: string;
  /** A missing plate is only suspicious on shots where one is normally in frame. */
  expectsPlate: boolean;
}

/** In PDF page order - matches the photo guide. */
export const CAR_PHOTO_SLOTS: CarPhotoSlot[] = [
  { key: "cover", label: "Cover photo", hint: "Front 3/4 view", expectsPlate: true },
  { key: "back45", label: "Back 45°", hint: "Rear 3/4 view", expectsPlate: true },
  { key: "front", label: "Front View", hint: "Straight on, from the front", expectsPlate: true },
  { key: "back", label: "Back View", hint: "Straight on, from the rear", expectsPlate: true },
  { key: "side", label: "Side View", hint: "Full side of the car", expectsPlate: false },
  { key: "interiorFront", label: "Interior front", hint: "Front seats", expectsPlate: false },
  { key: "interiorBack", label: "Interior back", hint: "Rear seats", expectsPlate: false },
  { key: "dashboard", label: "Dashboard", hint: "Dashboard and steering wheel", expectsPlate: false },
];

export const CAR_PHOTO_FIELD_PREFIX = "photo_";
