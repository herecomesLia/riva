def seconds_to_ms(seconds: float, ndigits: int | None = None) -> float:
    milliseconds = seconds * 1000
    if ndigits is None:
        return milliseconds

    return round(milliseconds, ndigits)
