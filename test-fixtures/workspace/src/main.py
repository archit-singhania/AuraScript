"""A labeled, public editor fixture; no network or account access."""


def describe(name: str) -> str:
    return f"Hello, {name}."


if __name__ == "__main__":
    print(describe("AuraScript acceptance"))
