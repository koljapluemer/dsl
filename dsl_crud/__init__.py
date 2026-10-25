"""dsl-crud Flask application."""

def create_app():
    from dsl_crud.application import create_app as factory
    return factory()


__all__ = ["create_app"]
