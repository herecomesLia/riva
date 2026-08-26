from dataclasses import dataclass
from datetime import UTC, datetime, timedelta


@dataclass
class Clock:
    now: datetime = datetime(2025, 1, 1, 12, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, *, seconds: int = 0, minutes: int = 0) -> datetime:
        self.now += timedelta(seconds=seconds, minutes=minutes)
        return self.now
