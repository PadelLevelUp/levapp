from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from padel_app import model
from padel_app.sql_db import db
from padel_app.tools.input_tools import Block, Field, Form


class Backend_App(db.Model, model.Model):
    __tablename__ = "backend_app"
    __table_args__ = {"extend_existing": True}
    model_name = "Backend_App"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(80), nullable=False, unique=True)
    app_model_name = Column(String(80), nullable=False, unique=True)
    color = Column(String(10))

    image_id = Column(Integer, ForeignKey("images.id", ondelete="SET NULL"))
    image = relationship("Image", foreign_keys=[image_id])

    def get_create_form(self):
        def get_field(
            name,
            label,
            type,
            required=False,
            related_model=None,
            options=None,
            value=None,
        ):
            return Field(
                instance_id=self.id,
                model=self.model_name,
                name=name,
                label=label,
                type=type,
                required=required,
                related_model=related_model,
                options=options,
                value=value,
            )

        form = Form()
        # Create Picture block
        fields = [get_field(name="image_id", label="Icone da app", type="Picture")]
        picture_block = Block("picture_block", fields)
        form.add_block(picture_block)

        # Create Info block
        fields = [
            get_field(
                name="app_model_name",
                label="Name of Model",
                type="Select",
                required=True,
                options=[
                    obj.model_name
                    for obj in db.Model.__subclasses__()
                    if hasattr(obj, "model_name")
                ],
            ),
            get_field(name="name", label="Nome", type="Text", required=True),
            get_field(name="color", label="Cor", type="Color"),
        ]
        info_block = Block("info_block", fields)
        form.add_block(info_block)

        return form
