import React from "react";

/*
 * Four-direction intersection view.
 * Uses ONLY backend-provided observation values - nothing is invented.
 * Traffic intensity is a presentation label derived from the count the
 * backend returned (recent-window count), thresholds are fixed.
 */

const DIRECTIONS = ["north", "south", "east", "west"];

function intensityOf(recentCount) {
  // Presentation thresholds on backend-provided values only.
  if (recentCount >= 15) return "heavy";
  if (recentCount >= 6) return "moderate";
  return "low";
}

export default function IntersectionMonitor({ observations, dataSource }) {
  if (!observations) {
    return (
      <div className="empty-box">
        No observations available from the backend yet.
      </div>
    );
  }

  return (
    <div className="grid grid-4">
      {DIRECTIONS.map((name) => {
        const data = observations[name];

        if (!data) {
          return null;
        }

        const intensity = intensityOf(data.vehicle_count);

        return (
          <div className="direction-card" key={name}>
            <div className="direction-head">
              <span className="direction-name">{name}</span>
              <span className={`intensity ${intensity}`}>{intensity}</span>
            </div>
            <div className="direction-values">
              <span>
                Vehicle count<strong>{data.vehicle_count}</strong>
              </span>
              <span>
                Queue<strong>{data.queue_length}</strong>
              </span>
              <span>
                Wait (s)<strong>{data.waiting_time_seconds}</strong>
              </span>
            </div>
          </div>
        );
      })}
      {dataSource === "sample" && (
        <p className="row-label">
          Values arrive in a trailing 60-second observation window
          (controller definition) - this payload is SAMPLE data, not live traffic.
        </p>
      )}
    </div>
  );
}
