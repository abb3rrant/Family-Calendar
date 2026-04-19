from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, select

from ..db import session_scope
from ..events_bus import bus
from ..models import GroceryItem, Meal, Recipe, RecipeIngredient

router = APIRouter(prefix="/api/meals", tags=["meals"])

Slot = Literal["breakfast", "lunch", "dinner"]
VALID_SLOTS = {"breakfast", "lunch", "dinner"}


class MealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: date
    slot: str
    description: str
    recipe_id: int | None


class MealUpsert(BaseModel):
    description: str | None = None
    recipe_id: int | None = None


def _regenerate_grocery_for_meal(session, meal: Meal) -> None:
    """Drop existing grocery items tied to this meal, then insert fresh ones
    from the linked recipe. Called after any change to meal.recipe_id.
    """
    session.query(GroceryItem).filter(
        GroceryItem.source_meal_id == meal.id
    ).delete(synchronize_session=False)
    if meal.recipe_id is None:
        return
    ingredients = (
        session.execute(
            select(RecipeIngredient)
            .where(RecipeIngredient.recipe_id == meal.recipe_id)
            .order_by(RecipeIngredient.position)
        )
        .scalars()
        .all()
    )
    for ing in ingredients:
        session.add(
            GroceryItem(name=ing.name, source_meal_id=meal.id)
        )


@router.get("", response_model=list[MealOut])
def list_meals(start: date = Query(...), end: date = Query(...)):
    with session_scope() as session:
        stmt = (
            select(Meal)
            .where(and_(Meal.date >= start, Meal.date <= end))
            .order_by(Meal.date, Meal.slot)
        )
        rows = session.execute(stmt).scalars().all()
        return [MealOut.model_validate(r) for r in rows]


@router.put("/{meal_date}/{slot}", response_model=MealOut | None)
async def upsert_meal(meal_date: date, slot: str, payload: MealUpsert):
    if slot not in VALID_SLOTS:
        raise HTTPException(status_code=400, detail=f"Invalid slot: {slot}")

    # Figure out what "set" and "clear" mean for this request.
    description = (payload.description or "").strip() if payload.description is not None else None
    recipe_id = payload.recipe_id
    is_clear = (recipe_id is None) and (description is None or description == "")

    with session_scope() as session:
        row = session.execute(
            select(Meal).where(Meal.date == meal_date, Meal.slot == slot)
        ).scalar_one_or_none()

        if is_clear:
            if row is not None:
                # drop grocery items, then remove the meal
                session.query(GroceryItem).filter(
                    GroceryItem.source_meal_id == row.id
                ).delete(synchronize_session=False)
                session.delete(row)
            await bus.publish("meals-updated")
            await bus.publish("grocery-updated")
            return None

        if recipe_id is not None:
            recipe = session.get(Recipe, recipe_id)
            if recipe is None:
                raise HTTPException(status_code=404, detail="Recipe not found")
            display = description or recipe.name
        else:
            display = description or ""

        if row is None:
            row = Meal(
                date=meal_date, slot=slot, description=display, recipe_id=recipe_id
            )
            session.add(row)
            session.flush()
        else:
            row.description = display
            row.recipe_id = recipe_id
            session.flush()

        _regenerate_grocery_for_meal(session, row)
        session.flush()
        out = MealOut.model_validate(row)

    await bus.publish("meals-updated")
    await bus.publish("grocery-updated")
    return out
