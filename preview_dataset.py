import cv2
from pathlib import Path

folder = Path("datasets/imptc_samples/0000_20230322_081506")

for filename in ["sequence_overview_video.mp4", "sequence_tracks_video.mp4"]:
    path = folder / filename
    cap = cv2.VideoCapture(str(path))

    if not cap.isOpened():
        print("Cannot open:", path)
        continue

    fps = cap.get(cv2.CAP_PROP_FPS)
    frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    print(f"\n{filename}")
    print("Resolution:", int(cap.get(3)), "x", int(cap.get(4)))
    print("Duration:", round(frames / fps, 2), "seconds")

    for second in [0, 5, 10, 20, 30]:
        cap.set(cv2.CAP_PROP_POS_MSEC, second * 1000)
        ret, frame = cap.read()
        if ret:
            output = folder / f"{path.stem}_{second}s.jpg"
            cv2.imwrite(str(output), frame)
            print("Preview saved:", output)

    cap.release()
