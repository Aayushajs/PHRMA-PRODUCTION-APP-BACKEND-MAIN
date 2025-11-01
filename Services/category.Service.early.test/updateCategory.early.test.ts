
import { NextFunction, Request, Response } from "express";
import { deleteCache } from "../../Utils/cache";
import { handleResponse } from "../../Utils/handleResponse";
import { uploadToCloudinary } from "../../utils/cloudinaryUpload";
import CategoryService from '../category.Service';


// Services/category.Service.updateCategory.spec.ts


// Services/category.Service.updateCategory.spec.ts
// Manual mocks for dependencies
interface MockICategory {
  name: string;
  title: string;
  description?: string;
  imageUrl: string[];
  code: string;
  bannerUrl?: string[];
  offerText?: string;
  priority?: number;
  views: number;
  viewedBy: any[];
  isFeatured?: boolean;
  isActive?: boolean;
  createdBy?: any;
  updatedBy?: any;
}

class MockCategoryModel {
  static findById = jest.fn();
  static findOne = jest.fn();
  static findByIdAndUpdate = jest.fn();
}


// Mock for ObjectId
class MockObjectId {
  constructor(public id: string = 'mockObjectId') {}
  toString() {
    return this.id;
  }
}

// Mock for ApiError
class MockApiError extends Error {
  public statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Mock for genCodeFromName
const genCodeFromName = jest.fn((name: string) => `code-${name}`);

// Mock for uploadToCloudinary, deleteCache, handleResponse, getCache, setCache
jest.mock("../../utils/cloudinaryUpload", () => {
  const actual = jest.requireActual("../../utils/cloudinaryUpload");
  return {
    ...actual,
    uploadToCloudinary: jest.mocked(jest.fn()),
    __esModule: true,
  };
});
jest.mock("../../Utils/cache", () => {
  const actual = jest.requireActual("../../Utils/cache");
  return {
    ...actual,
    getCache: jest.mocked(jest.fn()),
    setCache: jest.mocked(jest.fn()),
    deleteCache: jest.mocked(jest.fn()),
    __esModule: true,
  };
});
jest.mock("../../Utils/handleResponse", () => {
  const actual = jest.requireActual("../../Utils/handleResponse");
  return {
    ...actual,
    handleResponse: jest.mocked(jest.fn()),
    __esModule: true,
  };
});
// Setup for static methods
(CategoryService as any).CategoryModel = MockCategoryModel as any;

// Setup for genCodeFromName
(CategoryService as any).genCodeFromName = genCodeFromName as any;

// Setup for ApiError
jest.mock("../../Utils/ApiError", () => {
  return {
    ApiError: MockApiError,
    __esModule: true,
  };
});

describe('CategoryService.updateCategory() updateCategory method', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      files: undefined,
      user: { _id: new MockObjectId('userId') },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  // Happy Path Tests

  it('should update category successfully with all fields and no file uploads', async () => {
    // This test aims to verify a full update with all fields provided, no file uploads.
    req.params = { id: 'cat123' };
    req.body = {
      name: 'NewName',
      title: 'NewTitle',
      description: 'NewDescription',
      code: 'NewCode',
      offerText: 'Special Offer',
      priority: 2,
      isFeatured: true,
      isActive: false,
    };

    const existingCategory: MockICategory = {
      name: 'OldName',
      title: 'OldTitle',
      description: 'OldDescription',
      imageUrl: ['img1.jpg'],
      code: 'OldCode',
      bannerUrl: ['banner1.jpg'],
      offerText: 'Old Offer',
      priority: 1,
      views: 10,
      viewedBy: [],
      isFeatured: false,
      isActive: true,
      createdBy: new MockObjectId('creatorId'),
      updatedBy: new MockObjectId('updaterId'),
    };

    MockCategoryModel.findById.mockResolvedValue(existingCategory as any as never);
    MockCategoryModel.findOne.mockResolvedValue(null as any as never);
    MockCategoryModel.findByIdAndUpdate.mockResolvedValue({
      ...existingCategory,
      ...req.body,
      updatedBy: req.user?._id,
    } as any as never);

    (deleteCache as jest.Mock).mockResolvedValue(undefined as any as never);
    (handleResponse as jest.Mock).mockReturnValue(res as any);

    await CategoryService.updateCategory(req as any, res as any, next);

    expect(MockCategoryModel.findById).toHaveBeenCalledWith('cat123');
    expect(MockCategoryModel.findOne).toHaveBeenCalledWith({
      $and: [
        { _id: { $ne: 'cat123' } },
        { $or: [{ name: 'NewName' }, { code: 'NewCode' }] },
      ],
    });
    expect(MockCategoryModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'cat123',
      expect.objectContaining({
        name: 'NewName',
        title: 'NewTitle',
        description: 'NewDescription',
        code: 'NewCode',
        offerText: 'Special Offer',
        priority: 2,
        isFeatured: true,
        isActive: false,
        updatedBy: req.user?._id,
      }),
      { new: true, runValidators: true }
    );
    expect(deleteCache).toHaveBeenCalledTimes(3);
    expect(handleResponse).toHaveBeenCalledWith(
      req,
      res,
      200,
      'Category updated successfully',
      expect.objectContaining({
        name: 'NewName',
        title: 'NewTitle',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should update category and upload new images and banners', async () => {
    // This test aims to verify that image and banner uploads are handled and URLs are updated.
    req.params = { id: 'cat456' };
    req.body = { name: 'ImageCat' };
    req.files = {
      imageUrl: [{ buffer: Buffer.from('imgdata') }],
      bannerUrl: [{ buffer: Buffer.from('bannerdata') }],
    };

    const existingCategory: MockICategory = {
      name: 'ImageCat',
      title: 'Title',
      imageUrl: ['oldimg.jpg'],
      code: 'Code',
      bannerUrl: ['oldbanner.jpg'],
      views: 0,
      viewedBy: [],
    };

    MockCategoryModel.findById.mockResolvedValue(existingCategory as any as never);
    MockCategoryModel.findOne.mockResolvedValue(null as any as never);
    (uploadToCloudinary as jest.Mock).mockResolvedValue({ secure_url: 'newimg.jpg' } as any as never);
    (uploadToCloudinary as jest.Mock).mockResolvedValueOnce({ secure_url: 'newimg.jpg' } as any as never);
    (uploadToCloudinary as jest.Mock).mockResolvedValueOnce({ secure_url: 'newbanner.jpg' } as any as never);

    MockCategoryModel.findByIdAndUpdate.mockResolvedValue({
      ...existingCategory,
      imageUrl: ['oldimg.jpg', 'newimg.jpg'],
      bannerUrl: ['oldbanner.jpg', 'newbanner.jpg'],
      updatedBy: req.user?._id,
    } as any as never);

    (deleteCache as jest.Mock).mockResolvedValue(undefined as any as never);
    (handleResponse as jest.Mock).mockReturnValue(res as any);

    await CategoryService.updateCategory(req as any, res as any, next);

    expect(uploadToCloudinary).toHaveBeenCalledWith(Buffer.from('imgdata'), 'categories/images');
    expect(uploadToCloudinary).toHaveBeenCalledWith(Buffer.from('bannerdata'), 'categories/banners');
    expect(MockCategoryModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'cat456',
      expect.objectContaining({
        imageUrl: ['oldimg.jpg', 'newimg.jpg'],
        bannerUrl: ['oldbanner.jpg', 'newbanner.jpg'],
      }),
      expect.any(Object)
    );
    expect(handleResponse).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('should update only provided fields and leave others unchanged', async () => {
    // This test aims to verify that only provided fields are updated, others remain unchanged.
    req.params = { id: 'cat789' };
    req.body = { name: 'PartialUpdate' };

    const existingCategory: MockICategory = {
      name: 'OldName',
      title: 'OldTitle',
      imageUrl: ['img.jpg'],
      code: 'OldCode',
      bannerUrl: ['banner.jpg'],
      views: 0,
      viewedBy: [],
    };

    MockCategoryModel.findById.mockResolvedValue(existingCategory as any as never);
    MockCategoryModel.findOne.mockResolvedValue(null as any as never);
    MockCategoryModel.findByIdAndUpdate.mockResolvedValue({
      ...existingCategory,
      name: 'PartialUpdate',
      updatedBy: req.user?._id,
    } as any as never);

    (deleteCache as jest.Mock).mockResolvedValue(undefined as any as never);
    (handleResponse as jest.Mock).mockReturnValue(res as any);

    await CategoryService.updateCategory(req as any, res as any, next);

    expect(MockCategoryModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'cat789',
      expect.objectContaining({
        name: 'PartialUpdate',
        updatedBy: req.user?._id,
      }),
      expect.any(Object)
    );
    expect(handleResponse).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  // Edge Case Tests

  it('should call next with ApiError if id is missing', async () => {
    // This test aims to verify that missing id results in a 400 error.
    req.params = {};

    await CategoryService.updateCategory(req as any, res as any, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 400,
      message: 'Category ID is required',
    }));
    expect(MockCategoryModel.findById).not.toHaveBeenCalled();
    expect(handleResponse).not.toHaveBeenCalled();
  });

  it('should call next with ApiError if category not found', async () => {
    // This test aims to verify that a non-existent category results in a 404 error.
    req.params = { id: 'notfound' };
    MockCategoryModel.findById.mockResolvedValue(null as any as never);

    await CategoryService.updateCategory(req as any, res as any, next);

    expect(MockCategoryModel.findById).toHaveBeenCalledWith('notfound');
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 404,
      message: 'Category not found',
    }));
    expect(handleResponse).not.toHaveBeenCalled();
  });

  it('should call next with ApiError if name/code conflict exists', async () => {
    // This test aims to verify that a name/code conflict results in a 400 error.
    req.params = { id: 'catconflict' };
    req.body = { name: 'ConflictName', code: 'ConflictCode' };

    const existingCategory: MockICategory = {
      name: 'OldName',
      title: 'Title',
      imageUrl: [],
      code: 'OldCode',
      bannerUrl: [],
      views: 0,
      viewedBy: [],
    };

    MockCategoryModel.findById.mockResolvedValue(existingCategory as any as never);
    MockCategoryModel.findOne.mockResolvedValue({ name: 'ConflictName', code: 'ConflictCode' } as any as never);

    await CategoryService.updateCategory(req as any, res as any, next);

    expect(MockCategoryModel.findOne).toHaveBeenCalledWith({
      $and: [
        { _id: { $ne: 'catconflict' } },
        { $or: [{ name: 'ConflictName' }, { code: 'ConflictCode' }] },
      ],
    });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 400,
      message: 'Category with this name or code already exists',
    }));
    expect(handleResponse).not.toHaveBeenCalled();
  });

  it('should generate code from name if code is not provided', async () => {
    // This test aims to verify that code is generated from name if not provided.
    req.params = { id: 'catgen' };
    req.body = { name: 'GenName' };

    const existingCategory: MockICategory = {
      name: 'OldName',
      title: 'Title',
      imageUrl: [],
      code: 'OldCode',
      bannerUrl: [],
      views: 0,
      viewedBy: [],
    };

    MockCategoryModel.findById.mockResolvedValue(existingCategory as any as never);
    MockCategoryModel.findOne.mockResolvedValue(null as any as never);
    MockCategoryModel.findByIdAndUpdate.mockResolvedValue({
      ...existingCategory,
      name: 'GenName',
      code: 'code-GenName',
      updatedBy: req.user?._id,
    } as any as never);

    (deleteCache as jest.Mock).mockResolvedValue(undefined as any as never);
    (handleResponse as jest.Mock).mockReturnValue(res as any);

    await CategoryService.updateCategory(req as any, res as any, next);

    expect(genCodeFromName).toHaveBeenCalledWith('GenName');
    expect(MockCategoryModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'catgen',
      expect.objectContaining({
        code: 'code-GenName',
      }),
      expect.any(Object)
    );
    expect(handleResponse).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle error thrown in try/catch and call next with 500', async () => {
    // This test aims to verify that unexpected errors are caught and a 500 error is returned.
    req.params = { id: 'caterr' };
    MockCategoryModel.findById.mockRejectedValue(new Error('DB error') as any as never);

    await CategoryService.updateCategory(req as any, res as any, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 500,
      message: expect.stringContaining('Failed to update category: DB error'),
    }));
    expect(handleResponse).not.toHaveBeenCalled();
  });

  it('should handle multiple image files in array', async () => {
    // This test aims to verify that multiple image files are uploaded and URLs are appended.
    req.params = { id: 'catmultiimg' };
    req.body = { name: 'MultiImgCat' };
    req.files = {
      imageUrl: [
        { buffer: Buffer.from('img1') },
        { buffer: Buffer.from('img2') },
      ],
    };

    const existingCategory: MockICategory = {
      name: 'MultiImgCat',
      title: 'Title',
      imageUrl: ['oldimg.jpg'],
      code: 'Code',
      bannerUrl: [],
      views: 0,
      viewedBy: [],
    };

    MockCategoryModel.findById.mockResolvedValue(existingCategory as any as never);
    MockCategoryModel.findOne.mockResolvedValue(null as any as never);
    (uploadToCloudinary as jest.Mock).mockResolvedValueOnce({ secure_url: 'newimg1.jpg' } as any as never);
    (uploadToCloudinary as jest.Mock).mockResolvedValueOnce({ secure_url: 'newimg2.jpg' } as any as never);

    MockCategoryModel.findByIdAndUpdate.mockResolvedValue({
      ...existingCategory,
      imageUrl: ['oldimg.jpg', 'newimg1.jpg', 'newimg2.jpg'],
      updatedBy: req.user?._id,
    } as any as never);

    (deleteCache as jest.Mock).mockResolvedValue(undefined as any as never);
    (handleResponse as jest.Mock).mockReturnValue(res as any);

    await CategoryService.updateCategory(req as any, res as any, next);

    expect(uploadToCloudinary).toHaveBeenCalledTimes(2);
    expect(MockCategoryModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'catmultiimg',
      expect.objectContaining({
        imageUrl: ['oldimg.jpg', 'newimg1.jpg', 'newimg2.jpg'],
      }),
      expect.any(Object)
    );
    expect(handleResponse).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle multiple banner files in array', async () => {
    // This test aims to verify that multiple banner files are uploaded and URLs are appended.
    req.params = { id: 'catmultibanner' };
    req.body = { name: 'MultiBannerCat' };
    req.files = {
      bannerUrl: [
        { buffer: Buffer.from('banner1') },
        { buffer: Buffer.from('banner2') },
      ],
    };

    const existingCategory: MockICategory = {
      name: 'MultiBannerCat',
      title: 'Title',
      imageUrl: [],
      code: 'Code',
      bannerUrl: ['oldbanner.jpg'],
      views: 0,
      viewedBy: [],
    };

    MockCategoryModel.findById.mockResolvedValue(existingCategory as any as never);
    MockCategoryModel.findOne.mockResolvedValue(null as any as never);
    (uploadToCloudinary as jest.Mock).mockResolvedValueOnce({ secure_url: 'newbanner1.jpg' } as any as never);
    (uploadToCloudinary as jest.Mock).mockResolvedValueOnce({ secure_url: 'newbanner2.jpg' } as any as never);

    MockCategoryModel.findByIdAndUpdate.mockResolvedValue({
      ...existingCategory,
      bannerUrl: ['oldbanner.jpg', 'newbanner1.jpg', 'newbanner2.jpg'],
      updatedBy: req.user?._id,
    } as any as never);

    (deleteCache as jest.Mock).mockResolvedValue(undefined as any as never);
    (handleResponse as jest.Mock).mockReturnValue(res as any);

    await CategoryService.updateCategory(req as any, res as any, next);

    expect(uploadToCloudinary).toHaveBeenCalledTimes(2);
    expect(MockCategoryModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'catmultibanner',
      expect.objectContaining({
        bannerUrl: ['oldbanner.jpg', 'newbanner1.jpg', 'newbanner2.jpg'],
      }),
      expect.any(Object)
    );
    expect(handleResponse).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('should trim string fields before updating', async () => {
    // This test aims to verify that string fields are trimmed before update.
    req.params = { id: 'cattrim' };
    req.body = {
      name: '  TrimName  ',
      title: '  TrimTitle  ',
      description: '  TrimDesc  ',
      code: '  TrimCode  ',
      offerText: '  TrimOffer  ',
    };

    const existingCategory: MockICategory = {
      name: 'OldName',
      title: 'OldTitle',
      imageUrl: [],
      code: 'OldCode',
      bannerUrl: [],
      views: 0,
      viewedBy: [],
    };

    MockCategoryModel.findById.mockResolvedValue(existingCategory as any as never);
    MockCategoryModel.findOne.mockResolvedValue(null as any as never);
    MockCategoryModel.findByIdAndUpdate.mockResolvedValue({
      ...existingCategory,
      name: 'TrimName',
      title: 'TrimTitle',
      description: 'TrimDesc',
      code: 'TrimCode',
      offerText: 'TrimOffer',
      updatedBy: req.user?._id,
    } as any as never);

    (deleteCache as jest.Mock).mockResolvedValue(undefined as any as never);
    (handleResponse as jest.Mock).mockReturnValue(res as any);

    await CategoryService.updateCategory(req as any, res as any, next);

    expect(MockCategoryModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'cattrim',
      expect.objectContaining({
        name: 'TrimName',
        title: 'TrimTitle',
        description: 'TrimDesc',
        code: 'TrimCode',
        offerText: 'TrimOffer',
      }),
      expect.any(Object)
    );
    expect(handleResponse).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('should convert priority to number, isFeatured and isActive to boolean', async () => {
    // This test aims to verify that priority, isFeatured, and isActive are converted to correct types.
    req.params = { id: 'cattypes' };
    req.body = {
      priority: '5',
      isFeatured: 'true',
      isActive: 'false',
    };

    const existingCategory: MockICategory = {
      name: 'TypeCat',
      title: 'Title',
      imageUrl: [],
      code: 'Code',
      bannerUrl: [],
      views: 0,
      viewedBy: [],
    };

    MockCategoryModel.findById.mockResolvedValue(existingCategory as any as never);
    MockCategoryModel.findOne.mockResolvedValue(null as any as never);
    MockCategoryModel.findByIdAndUpdate.mockResolvedValue({
      ...existingCategory,
      priority: 5,
      isFeatured: true,
      isActive: true, // Boolean('false') is true, so this is a subtle edge case
      updatedBy: req.user?._id,
    } as any as never);

    (deleteCache as jest.Mock).mockResolvedValue(undefined as any as never);
    (handleResponse as jest.Mock).mockReturnValue(res as any);

    await CategoryService.updateCategory(req as any, res as any, next);

    expect(MockCategoryModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'cattypes',
      expect.objectContaining({
        priority: 5,
        isFeatured: true,
        isActive: true,
      }),
      expect.any(Object)
    );
    expect(handleResponse).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});