from collections.abc import Iterable
from typing import Any


class FakeSession:
    def __init__(self, execute_error: Exception | None = None) -> None:
        self.execute_error = execute_error
        self.execute_calls: list[Any] = []

    async def execute(self, statement: Any) -> None:
        self.execute_calls.append(statement)
        if self.execute_error is not None:
            raise self.execute_error


class FakeSessionContext:
    def __init__(self, session: FakeSession) -> None:
        self.session = session
        self.enter_count = 0
        self.exit_count = 0

    async def __aenter__(self) -> FakeSession:
        self.enter_count += 1
        return self.session

    async def __aexit__(self, *args: object) -> None:
        self.exit_count += 1


class FakeSessionMaker:
    def __init__(self, session: FakeSession) -> None:
        self.session = session
        self.contexts: list[FakeSessionContext] = []

    def __call__(self) -> FakeSessionContext:
        context = FakeSessionContext(self.session)
        self.contexts.append(context)
        return context


class FakeDatabase:
    def __init__(self, ping_results: Iterable[object] | None = None) -> None:
        self.database_urls: list[str] = []
        self.ping_results = list(ping_results or [])
        self.ping_count = 0
        self.enter_count = 0
        self.exit_count = 0
        self.dispose_count = 0
        self.create_tables_count = 0
        self.drop_tables_count = 0
        self.reset_count = 0
        self.calls: list[str] = []

    async def __aenter__(self) -> "FakeDatabase":
        self.enter_count += 1
        self.calls.append("enter")
        return self

    async def __aexit__(self, *args: object) -> None:
        self.exit_count += 1
        self.calls.append("exit")
        await self.dispose()

    async def dispose(self) -> None:
        self.dispose_count += 1
        self.calls.append("dispose")

    async def ping(self) -> None:
        self.ping_count += 1
        self.calls.append("ping")
        if not self.ping_results:
            return

        result = self.ping_results.pop(0)
        if isinstance(result, BaseException):
            raise result

    async def create_tables(self) -> None:
        self.create_tables_count += 1
        self.calls.append("create_tables")

    async def drop_tables(self) -> None:
        self.drop_tables_count += 1
        self.calls.append("drop_tables")

    async def reset(self) -> None:
        self.reset_count += 1
        self.calls.append("reset")


class FakeEngine:
    def __init__(self) -> None:
        self.dispose_count = 0

    async def dispose(self) -> None:
        self.dispose_count += 1
