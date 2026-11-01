# FlowAI – Vehicle Detection Module

## Overview

This module uses YOLOv8 to detect and classify vehicles from traffic videos.

## Vehicle Categories

* Cars
* Motorcycles
* Bicycles
* Buses
* Trucks

## Features

* YOLO-based vehicle detection
* Vehicle tracking using ByteTrack
* Unique vehicle ID counting
* Bounding box visualization
* JSON detection results
* Processed traffic video generation

## Technologies

* Python
* YOLOv8
* OpenCV
* ByteTrack

## Installation

Install dependencies:

```bash
pip install -r requirements.txt
```

Download the YOLOv8n model weights and place `yolov8n.pt` inside this folder.

Place your traffic video inside this folder and name it `traffic.mp4`.

## Run the detection system

```bash
python detect_vehicles.py
```

## Output

* `output/traffic_detected.mp4`
* `results/detections.json`
