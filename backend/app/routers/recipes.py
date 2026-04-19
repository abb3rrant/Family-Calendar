from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from ..db import session_scope
from ..events_bus import bus
from ..models import Recipe, RecipeIngredient

router = APIRouter(prefix="/api/recipes", tags=["recipes"])


class IngredientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    position: int


class RecipeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    notes: str | None
    ingredients: list[IngredientOut]


class RecipeCreate(BaseModel):
    name: str
    notes: str | None = None
    ingredients: list[str] = []


class RecipeUpdate(BaseModel):
    name: str | None = None
    notes: str | None = None
    ingredients: list[str] | None = None


def _load(session, recipe_id: int) -> Recipe:
    row = session.get(Recipe, recipe_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return row


@router.get("", response_model=list[RecipeOut])
def list_recipes():
    with session_scope() as session:
        rows = session.execute(select(Recipe).order_by(Recipe.name)).scalars().all()
        return [RecipeOut.model_validate(r) for r in rows]


@router.post("", response_model=RecipeOut, status_code=201)
async def create_recipe(payload: RecipeCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    with session_scope() as session:
        existing = session.execute(
            select(Recipe).where(Recipe.name == name)
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=409, detail="A recipe with that name already exists")
        recipe = Recipe(name=name, notes=payload.notes)
        session.add(recipe)
        session.flush()
        for pos, ing in enumerate(payload.ingredients):
            ing = ing.strip()
            if not ing:
                continue
            session.add(
                RecipeIngredient(recipe_id=recipe.id, name=ing, position=pos)
            )
        session.flush()
        session.refresh(recipe)
        out = RecipeOut.model_validate(recipe)
    await bus.publish("recipes-updated")
    return out


@router.get("/{recipe_id}", response_model=RecipeOut)
def get_recipe(recipe_id: int):
    with session_scope() as session:
        row = _load(session, recipe_id)
        return RecipeOut.model_validate(row)


@router.patch("/{recipe_id}", response_model=RecipeOut)
async def update_recipe(recipe_id: int, payload: RecipeUpdate):
    with session_scope() as session:
        recipe = _load(session, recipe_id)
        if payload.name is not None:
            new_name = payload.name.strip()
            if not new_name:
                raise HTTPException(status_code=400, detail="Name is required")
            recipe.name = new_name
        if payload.notes is not None:
            recipe.notes = payload.notes
        if payload.ingredients is not None:
            recipe.ingredients.clear()
            session.flush()
            for pos, ing in enumerate(payload.ingredients):
                ing = ing.strip()
                if not ing:
                    continue
                session.add(
                    RecipeIngredient(recipe_id=recipe.id, name=ing, position=pos)
                )
        session.flush()
        session.refresh(recipe)
        out = RecipeOut.model_validate(recipe)
    # Kick the events bus so any scheduled meals using this recipe get their grocery
    # items refreshed by the frontend re-fetching.
    await bus.publish("recipes-updated")
    return out


@router.delete("/{recipe_id}", status_code=204)
async def delete_recipe(recipe_id: int):
    with session_scope() as session:
        recipe = _load(session, recipe_id)
        session.delete(recipe)
    await bus.publish("recipes-updated")
