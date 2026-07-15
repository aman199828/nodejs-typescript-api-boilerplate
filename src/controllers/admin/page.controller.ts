import { Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { ApiResponse } from '../../resources/ApiResponse';

// Page Type Constants
export const PageType = {
  privacy_policy: 1,
  terms_of_service: 2,
  data_processing_agreement: 3,
  faq: 4,
  about_us: 5,
  contact_us: 6,
} as const;

const allowedPageTypeValues = Object.values(PageType) as number[];

export const listPagesAdmin = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      typeId,
      stateId,
      sortBy,
      sortOrder = 'desc',
    } = req.query as any;

    const pageNum = Math.max(parseInt(String(page), 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(String(limit), 10) || 10, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (typeId !== undefined) {
      const parsedTypeId = parseInt(String(typeId), 10);
      if (!isNaN(parsedTypeId) && allowedPageTypeValues.includes(parsedTypeId)) {
        where.typeId = String(parsedTypeId);
      }
    }
    if (stateId !== undefined) {
      const parsedStateId = parseInt(String(stateId), 10);
      if (!isNaN(parsedStateId)) where.stateId = parsedStateId;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy = sortBy
      ? { [sortBy as string]: (sortOrder === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc' }
      : { id: 'desc' as const };

    const [data, total] = await Promise.all([
      (prisma as any).page.findMany({ where, orderBy: orderBy as any, skip, take: limitNum }),
      (prisma as any).page.count({ where }),
    ]);

    // Truncate description to 50 characters for listing
    const dataWithTruncatedDescription = data.map((page: any) => ({
      ...page,
      description: page.description
        ? page.description.length > 50
          ? page.description.substring(0, 50) + '...'
          : page.description
        : page.description,
    }));

    const totalPages = Math.ceil(total / limitNum) || 1;
    const meta = {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
    };

    return res.json(ApiResponse.success(dataWithTruncatedDescription, 'Pages list', 200, meta));
  } catch (error) {
    console.error('Admin list pages error:', error);
    return res.status(500).json(ApiResponse.error('Server error'));
  }
};

export const createPageAdmin = async (req: Request, res: Response) => {
  try {
    const { title, description, typeId, stateId = 1 } = req.body ?? {};

    if (!title || !description || typeId === undefined) {
      return res.status(400).json(ApiResponse.error('title, description and typeId are required'));
    }

    const parsedTypeId = parseInt(String(typeId), 10);
    if (isNaN(parsedTypeId) || !allowedPageTypeValues.includes(parsedTypeId)) {
      return res.status(400).json(ApiResponse.error('Invalid type ID'));
    }

    const existing = await (prisma as any).page.findFirst({
      where: { typeId: String(parsedTypeId) },
    });
    if (existing) {
      return res.status(409).json(ApiResponse.error('Page of this type already exists'));
    }

    const page = await (prisma as any).page.create({
      data: {
        title,
        description,
        typeId: String(parsedTypeId),
        stateId: Number(stateId) || 1,
        createdById: (req as any).user?.id ?? null,
      },
    });

    return res.status(201).json(ApiResponse.success(page, 'Page created successfully'));
  } catch (error) {
    console.error('Admin create page error:', error);
    return res.status(500).json(ApiResponse.error('Server error'));
  }
};

export const getPageAdmin = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json(ApiResponse.error('Invalid id'));

    const page = await (prisma as any).page.findUnique({ where: { id } });
    if (!page) return res.status(404).json(ApiResponse.error('Page not found'));
    return res.json(ApiResponse.success(page, 'Page details'));
  } catch (error) {
    console.error('Admin get page error:', error);
    return res.status(500).json(ApiResponse.error('Server error'));
  }
};

export const getPageByTypeIdAdmin = async (req: Request, res: Response) => {
  try {
    const { typeId } = req.params;
    const parsedTypeId = parseInt(String(typeId), 10);

    if (isNaN(parsedTypeId) || !allowedPageTypeValues.includes(parsedTypeId)) {
      return res.status(400).json(ApiResponse.error('Invalid type ID'));
    }

    const page = await (prisma as any).page.findFirst({
      where: { typeId: String(parsedTypeId) },
    });

    if (!page) return res.status(404).json(ApiResponse.error('Page not found'));
    return res.json(ApiResponse.success(page, 'Page details'));
  } catch (error) {
    console.error('Admin get page by type error:', error);
    return res.status(500).json(ApiResponse.error('Server error'));
  }
};

export const updatePageAdmin = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json(ApiResponse.error('Invalid id'));

    const { title, description, stateId, typeId } = req.body ?? {};

    const existing = await (prisma as any).page.findUnique({ where: { id } });
    if (!existing) return res.status(404).json(ApiResponse.error('Page not found'));

    if (typeId !== undefined) {
      const parsedTypeId = parseInt(String(typeId), 10);
      if (isNaN(parsedTypeId) || !allowedPageTypeValues.includes(parsedTypeId)) {
        return res.status(400).json(ApiResponse.error('Invalid type ID'));
      }
      const duplicate = await (prisma as any).page.findFirst({
        where: { typeId: String(parsedTypeId), NOT: { id } },
      });
      if (duplicate)
        return res.status(409).json(ApiResponse.error('Page of this type already exists'));
    }

    const page = await (prisma as any).page.update({
      where: { id },
      data: {
        title,
        description,
        stateId,
        typeId: typeId !== undefined ? String(parseInt(String(typeId), 10)) : undefined,
        updatedAt: new Date(),
      },
    });

    return res.json(ApiResponse.success(page, 'Page updated successfully'));
  } catch (error) {
    console.error('Admin update page error:', error);
    return res.status(500).json(ApiResponse.error('Server error'));
  }
};

export const deletePageAdmin = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json(ApiResponse.error('Invalid id'));

    const existing = await (prisma as any).page.findUnique({ where: { id } });
    if (!existing) return res.status(404).json(ApiResponse.error('Page not found'));

    await (prisma as any).page.delete({ where: { id } });
    return res.status(204).send();
  } catch (error) {
    console.error('Admin delete page error:', error);
    return res.status(500).json(ApiResponse.error('Server error'));
  }
};
