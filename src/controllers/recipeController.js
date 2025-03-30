const { generateWithLlama } = require('../services/llamaService');
const Recipe = require('../models/Recipe');
const Ingredient = require('../models/Ingredient');
const { generateRecipe } = require('../services/llamaService');

// Get recipe options based on cuisine and dish type
exports.getRecipeOptions = async (req, res) => {
  try {
    const { cuisine, dishType } = req.params;
    
    // Construct search query
    const searchQuery = cuisine && dishType 
      ? `${cuisine} ${dishType}` 
      : (cuisine || dishType);
    
    // Get recipes from database or generate with Llama
    const recipeOptions = await Recipe.find({ 
      tags: { $in: [searchQuery.toLowerCase()] } 
    }).select('name nutrition prepTime difficulty');
    
    if (recipeOptions.length > 0) {
      return res.status(200).json(recipeOptions);
    }
    
    // If no options in database, generate with Llama
    const prompt = `List 5 popular ${searchQuery} recipes. Return ONLY a JSON array in this format: 
    [{"name": "Dish name", "description": "Brief description"}]`;
    
    const response = await generateWithLlama(prompt);
    // Parse JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    const options = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    
    return res.status(200).json([...options, { name: "Create my own recipe", description: "Customize your own dish" }]);
  } catch (error) {
    console.error('Error getting recipe options:', error);
    return res.status(500).json({ error: 'Failed to get recipe options' });
  }
};

// Get recipe by name
// Get recipe by name
exports.getRecipeByName = async (req, res) => {
  try {
    const { name } = req.params;
    const recipe = await Recipe.findOne({ 
      name: { $regex: new RegExp(name, 'i') } 
    });
    
    if (recipe) {
      return res.status(200).json(recipe);
    }
    
    // Generate recipe with Llama if not in database
    const generatedRecipe = await generateRecipe('any', name);
    
    // Validate and fix recipe data before saving
    const validRecipe = {
      name: generatedRecipe.name || name,
      type: generatedRecipe.type || 'complete',
      cuisine: generatedRecipe.cuisine || 'any',
      ingredients: generatedRecipe.ingredients.map(ing => ({
        ingredient: ing.ingredient || 'Unknown ingredient',
        amount: ing.amount || '1',
        unit: ing.unit || ''
      })),
      instructions: Array.isArray(generatedRecipe.instructions) ? 
        generatedRecipe.instructions : 
        ['No instructions provided'],
      nutrition: {
        calories: generatedRecipe.nutrition?.calories || 0,
        protein: generatedRecipe.nutrition?.protein || 0,
        carbs: generatedRecipe.nutrition?.carbs || 0,
        fat: generatedRecipe.nutrition?.fat || 0,
        fiber: generatedRecipe.nutrition?.fiber || 0
      },
      prepTime: generatedRecipe.prepTime || 15,
      cookTime: generatedRecipe.cookTime || 30,
      servings: generatedRecipe.servings || 4,
      difficulty: generatedRecipe.difficulty || 'medium'
    };
    
    // Save validated recipe to database
    try {
      const newRecipe = new Recipe(validRecipe);
      await newRecipe.save();
      return res.status(200).json(newRecipe);
    } catch (validationError) {
      console.error('Recipe validation error:', validationError);
      // Still return the recipe to the user even if we couldn't save it
      return res.status(200).json(validRecipe);
    }
  } catch (error) {
    console.error('Error getting recipe:', error);
    // Return a basic fallback recipe
    const fallbackRecipe = {
      name: req.params.name,
      type: 'complete',
      cuisine: 'any',
      ingredients: [
        { ingredient: 'Main ingredient', amount: '500', unit: 'g' },
        { ingredient: 'Secondary ingredient', amount: '200', unit: 'g' },
        { ingredient: 'Seasoning', amount: '2', unit: 'tsp' }
      ],
      instructions: [
        'Prepare all ingredients.',
        'Cook main ingredients until done.',
        'Add seasonings and serve.'
      ],
      nutrition: { calories: 350, protein: 25, carbs: 30, fat: 15, fiber: 5 },
      prepTime: 15,
      cookTime: 30,
      servings: 4,
      difficulty: 'medium'
    };
    
    return res.status(200).json(fallbackRecipe);
  }
};

// Customize existing recipe
exports.customizeRecipe = async (req, res) => {
  try {
    const { recipeId } = req.params;
    const { customizations } = req.body;
    
    if (!customizations || !customizations.length) {
      return res.status(400).json({ error: 'Customizations are required' });
    }
    
    // Get original recipe
    const originalRecipe = await Recipe.findById(recipeId);
    if (!originalRecipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    
    // Generate customized recipe with Llama
    const customizedRecipe = await generateRecipe('custom', originalRecipe.name, {
      customizations
    });
    
    return res.status(200).json(customizedRecipe);
  } catch (error) {
    console.error('Error customizing recipe:', error);
    return res.status(500).json({ error: 'Failed to customize recipe' });
  }
};

// Get ingredient options by category
exports.getIngredientOptions = async (req, res) => {
  try {
    const { category } = req.params;
    
    const ingredientOptions = await Ingredient.find({ category })
      .select('name');
    
    if (ingredientOptions.length > 0) {
      return res.status(200).json(ingredientOptions);
    }
    
    // Generate options with Llama if not in database
    const prompt = `List 8 common ${category} ingredients. Return ONLY a JSON array in this format: 
    [{"name": "${category} name", "description": "Brief description"}]`;
    
    const response = await generateWithLlama(prompt);
    // Parse JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    const options = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    
    return res.status(200).json(options);
  } catch (error) {
    console.error(`Error getting ${req.params.category} options:`, error);
    return res.status(500).json({ error: `Failed to get ${req.params.category} options` });
  }
};

// Get ingredient recommendations
exports.getIngredientRecommendations = async (req, res) => {
  try {
    const { base, category, currentIngredients } = req.params;
    
    // Generate recommendations with Llama
    const prompt = `Recommend 5 ${category} options that go well with ${base} and ${currentIngredients}. Return ONLY a JSON array in this format: 
    [{"name": "${category} name", "description": "Why it's a good match"}]`;
    
    const response = await generateWithLlama(prompt);
    // Parse JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    const options = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    
    return res.status(200).json(options);
  } catch (error) {
    console.error(`Error getting ${req.params.category} recommendations:`, error);
    return res.status(500).json({ error: `Failed to get ${req.params.category} recommendations` });
  }
};

// Create custom recipe
exports.createCustomRecipe = async (req, res) => {
  try {
    const { 
      base, 
      protein, 
      vegetables, 
      seasonings,
      cookingMethod,
      nutritionalTargets, 
      allergies 
    } = req.body;
    
    // Generate custom recipe with Llama
    const customRecipePrompt = `
    Create a detailed recipe using:
    - Base: ${base}
    - Protein: ${protein}
    - Vegetables: ${vegetables.join(', ')}
    - Seasonings: ${seasonings.join(', ')}
    - Cooking Method: ${cookingMethod}
    ${nutritionalTargets ? `- Nutritional targets: ${JSON.stringify(nutritionalTargets)}` : ''}
    ${allergies && allergies.length ? `- Avoid these ingredients: ${allergies.join(', ')}` : ''}
    
    Provide the recipe in this JSON format:
    {
      "name": "Recipe Name",
      "ingredients": [{"ingredient": "Ingredient name", "amount": "amount", "unit": "unit"}],
      "instructions": ["Step 1", "Step 2", ...],
      "nutrition": {"calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number},
      "prepTime": number,
      "cookTime": number,
      "servings": number,
      "difficulty": "easy/medium/hard"
    }`;
    
    const response = await generateWithLlama(customRecipePrompt);
    
    // Extract the JSON part from the response
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || 
                     response.match(/```\n([\s\S]*?)\n```/) ||
                     response.match(/{[\s\S]*?}/);
                     
    const jsonString = jsonMatch ? jsonMatch[0] : response;
    const cleanedJsonString = jsonString.replace(/```json\n|```\n|```/g, '');
    
    try {
      const customRecipe = JSON.parse(cleanedJsonString);
      
      // Save the custom recipe to database
      const newRecipe = new Recipe({
        ...customRecipe,
        type: 'complete',
        tags: ['custom', base, protein, ...vegetables, ...seasonings, cookingMethod]
      });
      await newRecipe.save();
      
      return res.status(201).json(newRecipe);
    } catch (error) {
      console.error('Error parsing Llama response:', error);
      return res.status(500).json({ error: 'Failed to parse recipe', rawResponse: response });
    }
  } catch (error) {
    console.error('Error creating custom recipe:', error);
    return res.status(500).json({ error: 'Failed to create custom recipe' });
  }
};